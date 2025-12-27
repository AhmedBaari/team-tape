/**
 * Pagination utility functions
 */

/**
 * Extract pagination parameters from request query
 * @param {Object} query - Express request query object
 * @param {number} defaultLimit - Default items per page
 * @returns {Object} Pagination parameters
 */
export function getPaginationParams(query, defaultLimit = 20) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(
        100,
        Math.max(1, parseInt(query.limit) || defaultLimit)
    );
    const skip = (page - 1) * limit;

    return { page, limit, skip };
}

/**
 * Build pagination metadata for response
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total items count
 * @returns {Object} Pagination metadata
 */
export function buildPaginationMeta(page, limit, total) {
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
    };
}

/**
 * Apply pagination to MongoDB query
 * @param {Query} query - Mongoose query object
 * @param {Object} params - Pagination parameters from getPaginationParams
 * @returns {Query} Query with pagination applied
 */
export function applyPagination(query, params) {
    return query.skip(params.skip).limit(params.limit);
}
