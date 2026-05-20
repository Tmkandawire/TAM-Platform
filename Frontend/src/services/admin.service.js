/**
 * @file services/admin.service.js
 * @module services
 *
 * Admin API service — all calls to /api/v1/admin/* endpoints.
 *
 * Returns data payloads directly — the Axios interceptor in api.js
 * unwraps response.data, so call sites receive the ApiResponse envelope.
 * Individual hooks/pages unwrap the `.data` field from the envelope.
 *
 * Endpoints covered:
 *  GET    /admin/members/pending                          → pending member list
 *  PATCH  /admin/members/approve/:id                     → approve member
 *  PATCH  /admin/members/reject/:id                      → reject member
 *  PATCH  /admin/members/suspend/:id                     → suspend member
 *  GET    /admin/documents                               → document review queue
 *  PATCH  /admin/documents/:userId/:docId/approve        → approve document
 *  PATCH  /admin/documents/:userId/:docId/reject         → reject document
 *  PATCH  /admin/documents/:userId/:docId/request-resubmission → request resubmission
 *  POST   /admin/documents/bulk-review                   → bulk document action
 *  GET    /admin/audit-logs                              → audit log list
 *  GET    /admin/audit-logs/:id                          → single audit log entry
 *  POST   /admin/broadcasts                              → send broadcast message
 *
 * Query keys:
 *  All React Query keys for admin data are defined here so every hook
 *  and page that touches admin cache imports from one source of truth.
 *  This prevents silent cache misses from key drift across files.
 */

import api from "./api.js";

// ─── Query keys ───────────────────────────────────────────────────────────────

/**
 * React Query cache keys for all admin data.
 *
 * Usage:
 *   useQuery({ queryKey: ADMIN_QUERY_KEYS.pendingMembers })
 *   queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.members.all })
 */
export const ADMIN_QUERY_KEYS = {
  /** Invalidates all admin-related cache entries */
  all: ["admin"],

  members: {
    /** Invalidates all member-related admin cache entries */
    all: ["admin", "members"],

    /** Pending member list (accepts filter params as third element) */
    pending: (params = {}) => ["admin", "members", "pending", params],

    /** All members list with optional status filter */
    list: (params = {}) => ["admin", "members", "list", params],

    /** Single member detail by id */
    detail: (id) => ["admin", "members", id],
  },

  documents: {
    /** Invalidates all document-related admin cache entries */
    all: ["admin", "documents"],

    /** Document review queue (accepts filter params as third element) */
    queue: (params = {}) => ["admin", "documents", "queue", params],

    /** Single document detail */
    detail: (userId, docId) => ["admin", "documents", userId, docId],
  },

  auditLogs: {
    /** Invalidates all audit log cache entries */
    all: ["admin", "audit-logs"],

    /** Audit log list (accepts filter params as third element) */
    list: (params = {}) => ["admin", "audit-logs", "list", params],

    /** Single audit log entry by id */
    detail: (id) => ["admin", "audit-logs", id],
  },

  broadcasts: {
    /** Invalidates all broadcast cache entries */
    all: ["admin", "broadcasts"],
  },

  // ── Dashboard convenience keys ─────────────────────────────────────────────
  // Stable (no params) keys used by the dashboard for independent queries.
  // These are separate from the parameterised keys above so the dashboard
  // can be invalidated independently from list pages.

  /** Stable key for dashboard pending members count */
  pendingMembers: ["admin", "members", "pending", "dashboard"],

  /** Stable key for dashboard pending documents count */
  pendingDocuments: ["admin", "documents", "queue", "dashboard"],

  /** Stable key for dashboard recent activity feed */
  recentActivity: ["admin", "audit-logs", "recent"],
  memberStats: ["admin", "members", "stats"],
};

// ─── Service ──────────────────────────────────────────────────────────────────

const adminService = {
  /* ── Members ────────────────────────────────────────────────────────────── */

  /**
   * Fetch the paginated list of pending members awaiting review.
   *
   * @param {{ page?: number, limit?: number }} params
   * @returns {Promise<ApiResponse<Profile[]>>}
   */
  getPendingMembers: (params = {}) =>
    api.get("/admin/members/pending", { params }),

  /**
   * Approve a member application.
   *
   * @param {string} id - MongoDB ObjectId of the target user
   * @returns {Promise<ApiResponse<Profile>>}
   */
  approveMember: (id) => api.patch(`/admin/members/approve/${id}`),

  /**
   * Reject a member application.
   *
   * @param {string} id   - MongoDB ObjectId of the target user
   * @param {string} reason - Admin-authored rejection reason (min 10 chars)
   * @returns {Promise<ApiResponse<Profile>>}
   */
  rejectMember: (id, reason) =>
    api.patch(`/admin/members/reject/${id}`, { reason }),

  /**
   * Suspend an active member account.
   *
   * @param {string} id   - MongoDB ObjectId of the target user
   * @param {string} reason - Admin-authored suspension reason (min 10 chars)
   * @returns {Promise<ApiResponse<Profile>>}
   */
  suspendMember: (id, reason) =>
    api.patch(`/admin/members/suspend/${id}`, { reason }),

  reinstateMember: (id) => api.patch(`/admin/members/reinstate/${id}`),
  softDeleteMember: (id, reason) =>
    api.patch(`/admin/members/soft-delete/${id}`, { reason }),
  hardDeleteMember: (id) => api.delete(`/admin/members/hard-delete/${id}`),

  getMemberStats: () => api.get("/admin/members/stats"),

  getMembers: (params = {}) => api.get("/admin/members", { params }),

  /* ── Documents ──────────────────────────────────────────────────────────── */

  /**
   * Fetch the paginated document review queue.
   * All params are optional — absent params return the full unfiltered queue.
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   status?: string,
   *   documentType?: string,
   *   priority?: string,
   *   sortBy?: string,
   * }} params
   * @returns {Promise<ApiResponse<Document[]>>}
   */
  getPendingDocuments: (params = {}) => api.get("/admin/documents", { params }),

  /**
   * Approve a single document.
   *
   * @param {string} userId - MongoDB ObjectId of the document owner
   * @param {string} docId  - MongoDB ObjectId of the document
   * @returns {Promise<ApiResponse<Profile>>}
   */
  approveDocument: (userId, docId) =>
    api.patch(`/admin/documents/${userId}/${docId}/approve`),

  /**
   * Reject a single document.
   *
   * @param {string} userId  - MongoDB ObjectId of the document owner
   * @param {string} docId   - MongoDB ObjectId of the document
   * @param {string} reason  - Admin-authored rejection reason (min 10 chars)
   * @returns {Promise<ApiResponse<Profile>>}
   */
  rejectDocument: (userId, docId, reason) =>
    api.patch(`/admin/documents/${userId}/${docId}/reject`, { reason }),

  /**
   * Request resubmission of a specific document.
   *
   * @param {string}   userId             - MongoDB ObjectId of the document owner
   * @param {string}   docId              - MongoDB ObjectId of the document
   * @param {string}   reason             - Why resubmission is needed (min 10 chars)
   * @param {string[]} documentsRequired  - Document types the member must re-upload
   * @returns {Promise<ApiResponse<Profile>>}
   */
  requestResubmission: (userId, docId, reason, documentsRequired) =>
    api.patch(`/admin/documents/${userId}/${docId}/request-resubmission`, {
      reason,
      documentsRequired,
    }),

  /**
   * Process a batch of document review decisions.
   * Returns HTTP 207 Multi-Status — inspect result.results and result.errors
   * for per-item outcomes.
   *
   * @param {{
   *   action: "approve" | "reject",
   *   documents: Array<{ userId: string, documentId: string }>,
   *   reason?: string,
   * }} payload
   * @returns {Promise<ApiResponse<BulkReviewResult>>}
   */
  bulkReviewDocuments: (payload) =>
    api.post("/admin/documents/bulk-review", payload),

  /* ── Audit logs ─────────────────────────────────────────────────────────── */

  /**
   * Fetch the paginated, filterable audit log list.
   * All params are optional — absent params return the full log desc by createdAt.
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   sortBy?: string,
   *   sortDir?: string,
   *   actorId?: string,
   *   targetId?: string,
   *   action?: string,
   *   targetType?: string,
   *   status?: string,
   *   from?: string,
   *   to?: string,
   * }} params
   * @returns {Promise<ApiResponse<AuditLog[]>>}
   */
  getAuditLogs: (params = {}) => api.get("/admin/audit-logs", { params }),

  /**
   * Fetch a single audit log entry by its MongoDB ObjectId.
   *
   * @param {string} id - MongoDB ObjectId of the audit log entry
   * @returns {Promise<ApiResponse<AuditLog>>}
   */
  getAuditLogById: (id) => api.get(`/admin/audit-logs/${id}`),

  /* ── Broadcasts ─────────────────────────────────────────────────────────── */

  /**
   * Send a broadcast message to all members or a filtered subset.
   *
   * An idempotency key should be generated on the frontend (crypto.randomUUID())
   * and included in the payload to prevent duplicate sends on retry.
   *
   * @param {{
   *   title: string,
   *   subject: string,
   *   message: string,
   *   audienceType: "ALL" | "FILTERED",
   *   filters?: {
   *     status?: string[],
   *     membershipType?: string[],
   *   },
   *   idempotencyKey: string,
   * }} payload
   * @returns {Promise<ApiResponse<BroadcastResult>>}
   */
  sendBroadcast: (payload) => api.post("/admin/broadcasts", payload),
};

export default adminService;
