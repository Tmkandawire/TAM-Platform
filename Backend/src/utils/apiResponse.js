/* -------------------------
   API RESPONSE UTILITY
   Standardized response shape
   across the entire platform
------------------------- */
class ApiResponse {
  constructor(statusCode, data = null, message = "Success", meta = null) {
    this.success = statusCode >= 200 && statusCode < 300;
    this.statusCode = statusCode;
    this.message = message;

    // Only include data key if data exists
    if (data !== null && data !== undefined) {
      this.data = data;
    }

    // Pagination / extra metadata (totalCount, page, limit, etc.)
    if (meta !== null && meta !== undefined) {
      this.meta = meta;
    }

    // ISO timestamp on every response for debugging and logging
    this.timestamp = new Date().toISOString();
  }

  /* -------------------------
     STATIC FACTORY METHODS
     Semantic, readable call
     sites across controllers
  ------------------------- */

  // 200 — data returned successfully
  static ok(data, message = "Success", meta = null) {
    return new ApiResponse(200, data, message, meta);
  }

  // 201 — resource created
  static created(data, message = "Created successfully") {
    return new ApiResponse(201, data, message);
  }

  // 204 — success with no content (delete operations)
  static noContent(message = "Deleted successfully") {
    return new ApiResponse(204, null, message);
  }

  // Paginated list responses
  static paginated(data, pagination) {
    const meta = {
      total: pagination.total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(pagination.total / pagination.limit),
      hasNextPage:
        pagination.page < Math.ceil(pagination.total / pagination.limit),
      hasPrevPage: pagination.page > 1,
    };
    return new ApiResponse(200, data, "Success", meta);
  }
}

export default ApiResponse;
