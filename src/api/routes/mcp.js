import express from 'express';
import {
    listResources,
    listMeetingsResource,
    getMeetingResource,
} from '../controllers/mcpController.js';

const router = express.Router();

/**
 * MCP routes
 * All routes are protected by authentication middleware from parent router
 */

// List all available MCP resources
router.get('/resources', listResources);

// meetings://list resource
router.get('/resources/meetings/list', listMeetingsResource);

// meetings://meeting/{id} resource
router.get('/resources/meetings/:id', getMeetingResource);

export default router;
