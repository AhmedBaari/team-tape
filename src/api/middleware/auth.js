import logger from '../../utils/logger.js';

/**
 * API Key Authentication Middleware
 * Validates API key from Authorization header
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function authenticateApiKey(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            logger.warn('API request missing Authorization header', {
                path: req.path,
                ip: req.ip,
            });
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing Authorization header',
            });
        }

        // Support both "Bearer <key>" and plain "<key>" formats
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : authHeader;

        const apiKey = process.env.API_KEY;

        if (!apiKey) {
            logger.error('API_KEY environment variable not configured');
            return res.status(500).json({
                error: 'Internal Server Error',
                message: 'API authentication not configured',
            });
        }

        if (token !== apiKey) {
            logger.warn('Invalid API key attempt', {
                path: req.path,
                ip: req.ip,
            });
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid API key',
            });
        }

        // API key is valid, proceed to next middleware
        next();
    } catch (error) {
        logger.error('Error in authentication middleware', {
            error: error.message,
            stack: error.stack,
        });
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Authentication error',
        });
    }
}

/**
 * Optional API key authentication for public-ish endpoints
 * If API key is provided, validates it. Otherwise allows through.
 * (Not used in current implementation - all endpoints require auth)
 */
export function optionalApiKey(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return next(); // No auth header, allow through
    }

    // If auth header exists, validate it
    return authenticateApiKey(req, res, next);
}
