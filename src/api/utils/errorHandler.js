import logger from '../../utils/logger.js';

/**
 * Standard API error response format
 */
export class ApiError extends Error {
    constructor(statusCode, message, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.name = 'ApiError';
    }
}

/**
 * Express error handling middleware
 * Catches all errors and returns standardized JSON response
 */
export function errorHandler(err, req, res, next) {
    // Log the error
    logger.error('API Error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        statusCode: err.statusCode || 500,
    });

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            message: err.message,
            details: err.errors,
        });
    }

    // Mongoose cast error (invalid ObjectId)
    if (err.name === 'CastError') {
        return res.status(400).json({
            error: 'Invalid ID',
            message: 'The provided ID is not valid',
        });
    }

    // Custom API error
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            error: err.name,
            message: err.message,
            details: err.details,
        });
    }

    // Default server error
    return res.status(err.statusCode || 500).json({
        error: 'Internal Server Error',
        message: err.message || 'An unexpected error occurred',
    });
}

/**
 * Async handler wrapper to catch promise rejections
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Not found handler for undefined routes
 */
export function notFoundHandler(req, res) {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`,
    });
}
