import express from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import meetingsRouter from './meetings.js';
import analyticsRouter from './analytics.js';

const router = express.Router();

// Apply authentication to all API routes
router.use(authenticateApiKey);

// Mount sub-routers
router.use('/meetings', meetingsRouter);
router.use('/analytics', analyticsRouter);

// API root endpoint
router.get('/', (req, res) => {
    res.json({
        message: 'TeamTape API v1',
        version: '1.0.0',
        endpoints: {
            meetings: {
                list: 'GET /api/v1/meetings',
                details: 'GET /api/v1/meetings/:id',
                transcript: 'GET /api/v1/meetings/:id/transcript',
                summary: 'GET /api/v1/meetings/:id/summary',
                audio: 'GET /api/v1/meetings/:id/audio',
                participants: 'GET /api/v1/meetings/:id/participants',
            },
            analytics: {
                userSpeakingTime: 'GET /api/v1/analytics/user-speaking-time',
                summary: 'GET /api/v1/analytics/summary',
            },
        },
        documentation: 'https://github.com/AhmedBaari/team-tape',
    });
});

export default router;
