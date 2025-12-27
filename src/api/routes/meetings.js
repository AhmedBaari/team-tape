import express from 'express';
import {
    listMeetings,
    getMeeting,
    getTranscript,
    getSummary,
    getAudio,
    getParticipants,
} from '../controllers/meetingsController.js';

const router = express.Router();

/**
 * Meeting routes
 * All routes are protected by authentication middleware from parent router
 */

// List all meetings with pagination and filtering
router.get('/', listMeetings);

// Get single meeting details
router.get('/:id', getMeeting);

// Get meeting transcript
router.get('/:id/transcript', getTranscript);

// Get meeting summary
router.get('/:id/summary', getSummary);

// Download meeting audio
router.get('/:id/audio', getAudio);

// Get meeting participants
router.get('/:id/participants', getParticipants);

export default router;
