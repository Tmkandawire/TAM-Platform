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
 *  • Apply exponential backoff with jitter between retries
 *  • Preserve the original error when abort itself fails
 *  • Surface the callback's return value to the caller unchanged
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
 *  Both loops are bounded by MAX_TRANSACTION_ATTEMPTS /
 *  MAX_COMMIT_ATTEMPTS to prevent runaway retries on persistent failures.
 *
 * ─── Callback idempotency requirement ────────────────────────────────────────
 *
 *  !! CRITICAL !!
 *
 *  When a TransientTransactionError occurs the callback is re-executed in
 *  full.  This means the callback MUST be idempotent and MUST NOT perform
 *  irreversible external side effects inside the transaction body.
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
 *  • No logging  (callers own observability)
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
 * Base delay in milliseconds for exponential backoff between transaction retries.
 * Actual delay = BASE_BACKOFF_MS * 2^(attempt - 1) + jitter.
 */
const BASE_BACKOFF_MS = 50;

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
 * Resolves after a delay calculated as:
 *
 *   BASE_BACKOFF_MS × 2^(attempt − 1)  +  random jitter [0, MAX_JITTER_MS)
 *
 * Exponential growth bounds contention windows on the server side.
 * Jitter desynchronises concurrent callers that hit the same transient
 * error simultaneously, preventing coordinated retry storms.
 *
 * @param {number} attempt  1-based attempt number that just failed.
 * @returns {Promise<void>}
 */
function backoff(attempt) {
  const exponential = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  const jitter = Math.random() * MAX_JITTER_MS;
  return new Promise((resolve) => setTimeout(resolve, exponential + jitter));
}

/**
 * Validates that `connection` is a Mongoose Connection capable of starting
 * a session.
 *
 * Checks:
 *  1. Not null/undefined.
 *  2. Exposes a callable `startSession` — confirms the object is a Mongoose
 *     Connection and not a raw driver client or an undefined import.
 *  3. `readyState === 1` — confirms the connection is currently open.
 *     A disconnected connection will fail at startSession anyway, but
 *     failing here produces a clear, actionable error instead of an
 *     opaque driver exception.
 *
 * Note: transaction support (replica set, MongoDB 4.0+) cannot be confirmed
 * synchronously without an async server description check.  If sessions are
 * unsupported the driver will throw at startSession, which propagates
 * naturally to the caller.
 *
 * @param {unknown} connection
 * @throws {TypeError}  If the connection is absent or has no startSession.
 * @throws {Error}      If the connection is not in the open (readyState 1) state.
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

  // readyState is a Mongoose Connection integer: 0=disconnected, 1=connected,
  // 2=connecting, 3=disconnecting.  Only state 1 is safe to open a session on.
  if (connection.readyState !== undefined && connection.readyState !== 1) {
    throw new Error(
      "withMongoTransaction: `connection` is not open " +
        `(readyState: ${connection.readyState}).`,
    );
  }
}

/**
 * Attempts to commit the active transaction, retrying when the driver emits
 * UnknownTransactionCommitResult.
 *
 * Only the commit call is repeated — the caller's callback is NOT
 * re-executed because its writes are already staged in the transaction buffer.
 *
 * @param {import("mongoose").ClientSession} session
 * @returns {Promise<void>}
 * @throws Re-throws the commit error once all attempts are exhausted.
 */
async function commitWithRetry(session) {
  for (
    let commitAttempt = 1;
    commitAttempt <= MAX_COMMIT_ATTEMPTS;
    commitAttempt += 1
  ) {
    try {
      await session.commitTransaction();
      return;
    } catch (commitError) {
      const isRetryable = hasErrorLabel(commitError, UNKNOWN_COMMIT_RESULT);
      const hasAttemptsRemaining = commitAttempt < MAX_COMMIT_ATTEMPTS;

      if (isRetryable && hasAttemptsRemaining) {
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
 *  • Inner try/catch ensures that if abortTransaction throws (e.g. network
 *    failure during rollback), the abort error does not replace the original
 *    error that triggered the abort in the first place.
 *
 * The abort error, if any, is returned rather than thrown so that callers
 * remain in full control of what propagates to the service layer.
 *
 * @param {import("mongoose").ClientSession} session
 * @returns {Promise<Error | null>}  The abort error, or null if abort succeeded.
 */
async function tryAbortTransaction(session) {
  if (!session.inTransaction()) {
    return null;
  }

  try {
    await session.abortTransaction();
    return null;
  } catch (abortError) {
    // Return rather than throw — the caller holds the real error and must
    // remain in control of what propagates to the service layer.
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
 * Options forwarded directly to `session.startTransaction()`.
 * All fields are optional; the MongoDB driver applies its own defaults.
 *
 * Keeping options as a pass-through object rather than explicit parameters
 * ensures this wrapper remains non-breaking as driver option support evolves
 * (e.g. future timeout/cancellation fields can be added without a signature change).
 *
 * @property {{ level?: string }}                                   [readConcern]
 * @property {{ w?: string|number, j?: boolean, wtimeout?: number }} [writeConcern]
 * @property {number}                                               [maxCommitTimeMS]
 * @property {string}                                               [readPreference]
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
 *   Optional transaction-level settings forwarded to startTransaction.
 *   Use to override readConcern, writeConcern, maxCommitTimeMS, or
 *   readPreference per call site.
 *
 * @returns {Promise<T>}
 *   Resolves with the callback's return value on success.
 *
 * @throws {TypeError}  If `connection` or `callback` fail their precondition checks.
 * @throws {Error}      Re-throws the original callback or commit error on failure.
 *                      The session is always ended before the error propagates.
 */
export async function withMongoTransaction(connection, callback, options = {}) {
  assertValidConnection(connection);

  if (typeof callback !== "function") {
    throw new TypeError("withMongoTransaction: `callback` must be a function.");
  }

  const session = await connection.startSession();

  try {
    for (
      let transactionAttempt = 1;
      transactionAttempt <= MAX_TRANSACTION_ATTEMPTS;
      transactionAttempt += 1
    ) {
      session.startTransaction(options);

      try {
        const result = await callback(session);

        await commitWithRetry(session);

        return result;
      } catch (error) {
        // Attempt to abort. If abort itself fails, the abort error is captured
        // but does not replace `error` — root cause is always preserved.
        const abortError = await tryAbortTransaction(session);

        if (abortError !== null) {
          // Attach the secondary abort failure so it remains visible in logs
          // and error monitors without displacing the original error.
          error.abortError = abortError;
        }

        const isRetryable = hasErrorLabel(error, TRANSIENT_TRANSACTION_ERROR);
        const hasAttemptsRemaining =
          transactionAttempt < MAX_TRANSACTION_ATTEMPTS;

        if (isRetryable && hasAttemptsRemaining) {
          await backoff(transactionAttempt);
          continue;
        }

        throw error;
      }
    }
  } finally {
    // endSession fires unconditionally — whether the transaction committed,
    // aborted, or threw.  This is the only cleanup that belongs in finally.
    await session.endSession();
  }
}
