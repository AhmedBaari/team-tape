/**
 * MCP JSON-RPC Routes
 * Standard Model Context Protocol endpoint (POST /mcp)
 * 
 * This implements the official MCP protocol over HTTP
 * Separate from the legacy REST API routes
 */

import express from 'express';
import { handleMcpRequest } from '../../services/mcpService.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * MCP JSON-RPC Endpoint
 * POST /mcp
 * 
 * Accepts JSON-RPC 2.0 requests and returns JSON-RPC 2.0 responses
 * 
 * Request body format:
 * {
 *   "jsonrpc": "2.0",
 *   "method": "resources/list",
 *   "params": {},
 *   "id": 1
 * }
 * 
 * Supported methods:
 * - initialize: Initialize MCP connection
 * - resources/list: List available resources (meetings)
 * - resources/read: Read a specific resource (meeting transcript)
 * - ping: Health check
 */
router.post('/', async (req, res) => {
    try {
        const request = req.body;

        // Validate request structure
        if (!request || typeof request !== 'object') {
            return res.status(400).json({
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32700,
                    message: 'Parse error: Invalid JSON',
                },
            });
        }

        // Handle single request
        if (!Array.isArray(request)) {
            const response = await handleMcpRequest(request);
            return res.json(response);
        }

        // Handle batch requests
        const responses = await Promise.all(
            request.map((req) => handleMcpRequest(req))
        );

        return res.json(responses);
    } catch (error) {
        logger.error('MCP endpoint error', {
            error: error.message,
            stack: error.stack,
        });

        return res.status(500).json({
            jsonrpc: '2.0',
            id: null,
            error: {
                code: -32603,
                message: 'Internal server error',
                data: { details: error.message },
            },
        });
    }
});

/**
 * MCP GET Endpoint (for SSE/streaming support)
 * GET /mcp
 * 
 * Optional: Some MCP clients may use GET with query params for streaming
 * This is a simplified implementation for basic GET support
 */
router.get('/', async (req, res) => {
    // For GET requests, support a simple discovery/info endpoint
    res.json({
        protocol: 'MCP',
        version: '2024-11-05',
        transport: 'http',
        endpoint: '/mcp',
        methods: ['POST'],
        supportedMethods: [
            'initialize',
            'resources/list',
            'resources/read',
            'ping',
        ],
        description: 'Sastranet TeamTape MCP Server - Access team meeting recordings, transcripts, and AI summaries. Use POST with JSON-RPC 2.0 format.',
        documentation: 'See MCP_IMPLEMENTATION.md for details',
        meetingTypes: [
            'Daily standups and sync meetings',
            'Architecture discussions and design decisions',
            'Best practices and coding standards reviews',
            'Innovation brainstorming sessions',
            'Team retrospectives and planning',
        ],
    });
});

export default router;
