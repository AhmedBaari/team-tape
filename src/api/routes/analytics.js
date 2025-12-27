import express from 'express';
import {
    getUserSpeakingTime,
    getAnalyticsSummary,
} from '../controllers/analyticsController.js';

const router = express.Router();

/**
 * Analytics routes
 * All routes are protected by authentication middleware from parent router
 */

// Get total speaking time per user
router.get('/user-speaking-time', getUserSpeakingTime);

// Get overall analytics summary
router.get('/summary', getAnalyticsSummary);

export default router;
