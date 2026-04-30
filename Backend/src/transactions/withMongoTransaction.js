/**
 * @file withMongoTransaction.js
 * @module transactions
 *
 * Reusable execution wrapper for Mongoose/MongoDB transactions.
 *
 * Eliminates duplicated session lifecycle management (startSession, commit,
 * abort, endSession) across service-layer callers and enforces consistent,
 * production-safe retry behaviour.
 *
 * ─── Responsibilities ────────────────────────────────────────────────────────
 *
 *  • Start and unconditionally end the client session
 *  • Start, commit, and conditionally abort the transaction
 *  • Retry on driver-labelled transient errors (see Retry Semantics)
 *  • Apply exponential backoff with jitter, capped to MAX_BACKOFF_MS
 *  • Preserve the original error when abort itself fails (never mutates thrown values)
 *  • Surface the callback's return value to the caller unchanged
 *  • Emit optional instrumentation hooks for retry observability
 *
 * ─── Retry semantics ─────────────────────────────────────────────────────────
 *
 *  TransientTransactionError
 *    Emitted during the callback (write conflict, network blip, failover).
 *    The entire transaction — including the callback — is retried from the
 *    beginning.
 *
 *  UnknownTransactionCommitResult
 *    Emitted during commitTransaction when the driver cannot confirm whether
 *    the commit landed.  Only the commit is retried; the callback is NOT
 *    re-executed because its writes are already staged in the transaction buffer.
 *
 *  Both loops are bounded by MAX_TRANSACTION_ATTEMPTS / MAX_COMMIT_ATTEMPTS
 *  to prevent runaway retries on persistent failures.
 *
 * ─── Callback idempotency requirement ────────────────────────────────────────
 *
 *  !! CRITICAL !!
 *
 *  When a TransientTransactionError occurs, the callback is re-executed in
 *  full.  The callback MUST be idempotent and MUST NOT perform irreversible
 *  external side effects inside the transaction body.
 *
 *  The following are unsafe inside the callback:
 *    • Sending emails / push notifications
 *    • Charging a payment instrument
 *    • Emitting domain events to an external bus
 *    • Calling third-party APIs with observable side effects
 *
 *  These actions must be deferred until after withMongoTransaction resolves
 *  successfully.
 *
 * ─── What this module intentionally does NOT do ──────────────────────────────
 *
 *  • No business logic
 *  • No logging  (callers own observability via hook options)
 *  • No connection management  (caller supplies the Mongoose connection)
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *
 *  import { withMongoTransaction } from "../transactions/withMongoTransaction.js";
 *
 *  const result = await withMongoTransaction(
 *    mongooseConnection,
 *    async (session) => {
 *      const doc = await MyModel.create([payload], { session });
 *      await AuditModel.create([auditEntry], { session });
 *      return doc;
 *    },
 *    {
 *      readConcern:     { level: "snapshot" },
 *      writeConcern:    { w: "majority" },
 *      maxCommitTimeMS: 5_000,
 *      onTransactionRetry:  ({ phase, attempt, maxAttempts, elapsedMs, error }) =>
 *                             logger.warn({ phase, attempt, maxAttempts, elapsedMs, error }),
 *      onCommitRetry:       ({ phase, attempt, maxAttempts, elapsedMs, error }) =>
 *                             logger.warn({ phase, attempt, maxAttempts, elapsedMs, error }),
 *    },
 *  );
 */

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Maximum number of full transaction attempts (initial + retries).
 * Applies to TransientTransactionError recovery.
 */
const MAX_TRANSACTION_ATTEMPTS = 3;

/**
 * Maximum number of commit attempts per transaction attempt.
 * Applies to UnknownTransactionCommitResult recovery.
 */
const MAX_COMMIT_ATTEMPTS = 3;

/**
 * Base delay in milliseconds for exponential backoff.
 * Actual delay = min(BASE_BACKOFF_MS * 2^(attempt - 1), MAX_BACKOFF_MS) + jitter.
 */
const BASE_BACKOFF_MS = 50;

/**
 * Hard ceiling on backoff delay in milliseconds.
 *
 * Without this cap, exponential growth becomes unacceptable if MAX_TRANSACTION_ATTEMPTS
 * or MAX_COMMIT_ATTEMPTS is increased in the future.  The cap decouples the
 * retry count from the worst-case wait time.
 */
const MAX_BACKOFF_MS = 1_000;

/**
 * Maximum jitter in milliseconds added to each backoff window.
 * Jitter desynchronises concurrent retriers to prevent retry storms
 * under shared write contention or failover windows.
 */
const MAX_JITTER_MS = 30;

/**
 * Driver error label signalling the entire transaction is safe to retry.
 * Defined by the MongoDB specification — do not change.
 */
const TRANSIENT_TRANSACTION_ERROR = "TransientTransactionError";

/**
 * Driver error label signalling only the commit needs to be retried.
 * Defined by the MongoDB specification — do not change.
 */
const UNKNOWN_COMMIT_RESULT = "UnknownTransactionCommitResult";

/* ─────────────────────────────────────────────
   INTERNAL HELPERS
───────────────────────────────────────────── */

/**
 * Returns true when the MongoDB driver has attached `label` to `error`.
 *
 * The driver places retryability signals in `error.errorLabels` (string[]).
 * A missing or malformed property is treated as "not labelled" — this
 * function never throws regardless of what was caught.
 *
 * @param {unknown} error
 * @param {string}  label
 * @returns {boolean}
 */
function hasErrorLabel(error, label) {
  return (
    error !== null &&
    typeof error === "object" &&
    Array.isArray(error.errorLabels) &&
    error.errorLabels.includes(label)
  );
}

/**
 * Resolves after a capped, jittered exponential delay:
 *
 *   delay = min(BASE_BACKOFF_MS × 2^(attempt − 1), MAX_BACKOFF_MS)
 *           + random jitter [0, MAX_JITTER_MS)
 *
 * The cap ensures worst-case wait time stays predictable regardless of
 * how retry constants evolve.  Jitter desynchronises concurrent callers
 * to prevent coordinated retry storms.
 *
 * @param {number} attempt  1-based attempt number that just failed.
 * @returns {Promise<void>}
 */
function backoff(attempt) {
  const exponential = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, MAX_BACKOFF_MS);
  const jitter = Math.random() * MAX_JITTER_MS;
  return new Promise((resolve) => setTimeout(resolve, capped + jitter));
}

/**
 * Validates that `connection` is a Mongoose Connection capable of starting
 * a session.
 *
 * Checks:
 *  1. Not null/undefined.
 *  2. Exposes a callable `startSession` — confirms the object is a Mongoose
 *     Connection and not a raw driver client or an undefined import.
 *  3. `readyState` is checked as best-effort only.  Mongoose's readyState
 *     can transiently move during reconnection, pooling, or cluster failover,
 *     so we warn rather than hard-fail on non-open states.  A disconnected
 *     connection will produce a clear driver error at startSession anyway.
 *
 * Note: transaction support (replica set, MongoDB 4.0+) cannot be confirmed
 * synchronously without an async server description check.  If sessions are
 * unsupported the driver will throw at startSession, which propagates naturally.
 *
 * @param {unknown} connection
 * @throws {TypeError}  If the connection is absent or has no startSession.
 * @throws {Error}      If readyState is present and definitively disconnected (0).
 */
function assertValidConnection(connection) {
  if (connection == null) {
    throw new TypeError(
      "withMongoTransaction: `connection` must not be null or undefined.",
    );
  }

  if (typeof connection.startSession !== "function") {
    throw new TypeError(
      "withMongoTransaction: `connection` must be a Mongoose Connection " +
        "(expected a callable `startSession` method).",
    );
  }

  // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting.
  // Only hard-fail on 0 (definitively closed).  States 2 and 3 are transient
  // and the driver is more authoritative than the Mongoose wrapper during those
  // windows — let startSession be the final arbiter.
  if (connection.readyState === 0) {
    throw new Error(
      "withMongoTransaction: `connection` is disconnected (readyState: 0).",
    );
  }
}

/**
 * Validates that `options` is a plain object suitable for forwarding to
 * `session.startTransaction()`.
 *
 * `typeof x === "object"` is insufficient — it admits arrays, Date, Map,
 * Set, and class instances, none of which are valid option shapes.  The
 * driver would receive garbage silently; rejecting here produces a clear,
 * early error instead.
 *
 * Accepted prototypes:
 *  • Object.prototype  — standard object literal `{}`
 *  • null              — null-prototype object `Object.create(null)`,
 *                        which is a valid and intentionally "more plain"
 *                        plain object used in some platform utilities
 *
 * @param {unknown} options
 * @throws {TypeError}  If options is not a plain object.
 */
function assertValidOptions(options) {
  if (options === null || typeof options !== "object") {
    throw new TypeError(
      "withMongoTransaction: `options` must be a plain object.",
    );
  }

  const proto = Object.getPrototypeOf(options);

  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(
      "withMongoTransaction: `options` must be a plain object " +
        "(arrays, class instances, and built-in objects are not accepted).",
    );
  }
}

/**
 * Attaches `abortError` to `error` as a non-enumerable, non-configurable
 * property so it remains visible in debuggers and error monitors without:
 *
 *  • appearing in JSON.stringify output  (non-enumerable)
 *  • polluting structured log payloads   (non-enumerable)
 *  • being accidentally overwritten      (non-configurable)
 *
 * If `error` is frozen, a primitive, or otherwise non-extensible, the
 * attachment is silently skipped — the original error is never replaced or
 * wrapped, and the abort error is accepted as lost.  Root cause always wins.
 *
 * This deliberately avoids `error.abortError = abortError` (direct mutation)
 * which throws on frozen/non-extensible objects and is unsafe on unknown
 * thrown values (strings, numbers, null-prototype objects).
 *
 * @param {unknown} error
 * @param {Error}   abortError
 */
function attachAbortError(error, abortError) {
  if (error === null || typeof error !== "object") {
    // Primitives and null cannot have properties attached — silently skip.
    return;
  }

  if (!Object.isExtensible(error)) {
    // Frozen or sealed objects — silently skip rather than throw.
    return;
  }

  try {
    Object.defineProperty(error, "abortError", {
      value: abortError,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  } catch {
    // defineProperty can still throw in edge cases (e.g. proxy traps).
    // Silently skip — the original error must never be replaced.
  }
}

/**
 * Invokes `hook` if it is a function, swallowing any error it throws.
 *
 * Instrumentation hooks must never affect transaction control flow.
 * A hook that throws (e.g. a broken logger) must not abort a retryable
 * transaction or mask the real transaction error.
 *
 * @param {unknown}  hook
 * @param {object}   payload
 */
function safelyInvokeHook(hook, payload) {
  if (typeof hook !== "function") {
    return;
  }

  try {
    hook(payload);
  } catch {
    // Hook errors are intentionally suppressed.
  }
}

/**
 * Attempts to commit the active transaction, retrying when the driver emits
 * UnknownTransactionCommitResult.
 *
 * Only the commit call is repeated — the caller's callback is NOT
 * re-executed because its writes are already staged in the transaction buffer.
 *
 * Guards against committing a session with no active transaction: if the
 * driver invalidated the transaction state between retries, retrying an
 * impossible commit is wasteful and misleading.
 *
 * @param {import("mongoose").ClientSession} session
 * @param {Function | undefined}             onCommitRetry
 * @param {number}                           startTime  - `Date.now()` at transaction start, for elapsedMs.
 * @returns {Promise<void>}
 * @throws Re-throws the commit error once all attempts are exhausted.
 */
async function commitWithRetry(session, onCommitRetry, startTime) {
  for (
    let commitAttempt = 1;
    commitAttempt <= MAX_COMMIT_ATTEMPTS;
    commitAttempt += 1
  ) {
    // If the driver already closed the transaction (e.g. server-side timeout),
    // retrying the commit is impossible and will produce a confusing secondary error.
    if (!session.inTransaction()) {
      throw new Error(
        "withMongoTransaction: session is no longer in a transaction; commit cannot proceed.",
      );
    }

    try {
      await session.commitTransaction();
      return;
    } catch (commitError) {
      const isRetryable = hasErrorLabel(commitError, UNKNOWN_COMMIT_RESULT);
      const hasAttemptsRemaining = commitAttempt < MAX_COMMIT_ATTEMPTS;

      if (isRetryable && hasAttemptsRemaining) {
        safelyInvokeHook(onCommitRetry, {
          phase: "commit",
          attempt: commitAttempt,
          maxAttempts: MAX_COMMIT_ATTEMPTS,
          elapsedMs: Date.now() - startTime,
          error: commitError,
        });
        await backoff(commitAttempt);
        continue;
      }

      throw commitError;
    }
  }
}

/**
 * Attempts to abort the active transaction only if the session currently has
 * an open transaction.
 *
 * Guards:
 *  • `session.inTransaction()` prevents calling abort on a session whose
 *    transaction has already been committed or aborted by the driver, which
 *    would itself throw and obscure the root cause error.
 *
 *  • Inner try/catch ensures that if abortTransaction throws (e.g. a network
 *    failure during rollback), the abort error does not replace the original
 *    error that triggered the abort in the first place.
 *
 * Returns the abort error rather than throwing it, so callers remain in full
 * control of what propagates to the service layer.
 *
 * @param {import("mongoose").ClientSession} session
 * @returns {Promise<Error | null>}  The abort error, or null if abort succeeded / was not needed.
 */
async function tryAbortTransaction(session) {
  if (!session.inTransaction()) {
    return null;
  }

  try {
    await session.abortTransaction();
    return null;
  } catch (abortError) {
    return abortError instanceof Error
      ? abortError
      : new Error(String(abortError));
  }
}

/* ─────────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────────── */

/**
 * @typedef {Object} TransactionOptions
 *
 * Options forwarded to `session.startTransaction()`, plus optional
 * instrumentation hooks for retry observability.
 *
 * All fields are optional.  The MongoDB driver applies its own defaults
 * for any omitted transaction-level fields.
 *
 * Keeping options as a pass-through object rather than discrete parameters
 * ensures this wrapper remains non-breaking as driver option support evolves
 * (e.g. future AbortSignal / deadline fields can be added without a signature change).
 *
 * @property {{ level?: string }}                                    [readConcern]
 * @property {{ w?: string|number, j?: boolean, wtimeout?: number }} [writeConcern]
 * @property {number}                                                [maxCommitTimeMS]
 * @property {string}                                                [readPreference]
 *
 * @property {(payload: {
 *   phase:       "transaction",
 *   attempt:     number,
 *   maxAttempts: number,
 *   elapsedMs:   number,
 *   error:       unknown
 * }) => void} [onTransactionRetry]
 *   Called before each transaction retry (TransientTransactionError path).
 *   Use for logging, metrics, or tracing.  Must not throw.
 *
 * @property {(payload: {
 *   phase:       "commit",
 *   attempt:     number,
 *   maxAttempts: number,
 *   elapsedMs:   number,
 *   error:       unknown
 * }) => void} [onCommitRetry]
 *   Called before each commit retry (UnknownTransactionCommitResult path).
 *   Use for logging, metrics, or tracing.  Must not throw.
 */

/**
 * Executes `callback` inside a MongoDB transaction, managing the full
 * session lifecycle on behalf of the caller.
 *
 * The callback receives the active `ClientSession`, which it MUST forward
 * to every Mongoose operation via `{ session }`.  Its return value is
 * passed through to the caller unchanged.
 *
 * The callback MUST be idempotent.  On TransientTransactionError the
 * callback is re-executed in full.  Any irreversible external side effect
 * inside the callback (email, payment, event emission) will be duplicated.
 * See the module-level idempotency warning at the top of this file.
 *
 * @template T
 *
 * @param {import("mongoose").Connection} connection
 *   An active Mongoose connection.  Passed explicitly rather than using the
 *   global mongoose instance to support multi-tenant and multi-database
 *   deployments without hidden coupling.
 *
 * @param {(session: import("mongoose").ClientSession) => Promise<T>} callback
 *   The unit of work to run inside the transaction.
 *   MUST NOT call commitTransaction or abortTransaction directly —
 *   session lifecycle management is the sole responsibility of this wrapper.
 *
 * @param {TransactionOptions} [options={}]
 *   Optional transaction-level settings and instrumentation hooks.
 *   Hook properties (onTransactionRetry, onCommitRetry) are extracted before
 *   the remainder is forwarded to startTransaction.
 *
 * @returns {Promise<T>}
 *   Resolves with the callback's return value on success.
 *
 * @throws {TypeError}  If `connection`, `callback`, or `options` fail precondition checks.
 * @throws {Error}      Re-throws the original callback or commit error on failure.
 *                      The session is always ended before the error propagates.
 */
export async function withMongoTransaction(connection, callback, options = {}) {
  assertValidConnection(connection);

  if (typeof callback !== "function") {
    throw new TypeError("withMongoTransaction: `callback` must be a function.");
  }

  assertValidOptions(options);

  // Extract instrumentation hooks before forwarding options to the driver.
  // The driver must never receive unknown keys that could silently affect behaviour.
  const { onTransactionRetry, onCommitRetry, ...transactionOptions } = options;

  const session = await connection.startSession();

  // Captured once here so both hook call sites report elapsed time relative
  // to the same origin — the moment the session was opened.
  const startTime = Date.now();

  try {
    for (
      let transactionAttempt = 1;
      transactionAttempt <= MAX_TRANSACTION_ATTEMPTS;
      transactionAttempt += 1
    ) {
      session.startTransaction(transactionOptions);

      try {
        const result = await callback(session);

        await commitWithRetry(session, onCommitRetry, startTime);

        return result;
      } catch (error) {
        // Attempt to abort. If abort itself fails, the abort error is attached
        // to the original error as a non-enumerable property — root cause is
        // always preserved and the original error is never replaced or re-wrapped.
        const abortError = await tryAbortTransaction(session);

        if (abortError !== null) {
          attachAbortError(error, abortError);
        }

        const isRetryable = hasErrorLabel(error, TRANSIENT_TRANSACTION_ERROR);
        const hasAttemptsRemaining =
          transactionAttempt < MAX_TRANSACTION_ATTEMPTS;

        if (isRetryable && hasAttemptsRemaining) {
          safelyInvokeHook(onTransactionRetry, {
            phase: "transaction",
            attempt: transactionAttempt,
            maxAttempts: MAX_TRANSACTION_ATTEMPTS,
            elapsedMs: Date.now() - startTime,
            error,
          });
          await backoff(transactionAttempt);
          continue;
        }

        throw error;
      }
    }
  } finally {
    // endSession must fire unconditionally — committed, aborted, or thrown.
    //
    // Wrapped in try/catch so that a session cleanup failure (e.g. network
    // drop after commit) never replaces the real transaction error that is
    // already propagating.  Cleanup failures are secondary; root cause wins.
    try {
      await session.endSession();
    } catch {
      // Intentionally swallowed — see above.
    }
  }
}
