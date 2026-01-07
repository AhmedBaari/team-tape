#!/usr/bin/env node

/**
 * Simple MCP Client Test Script
 * Tests TeamTape MCP JSON-RPC endpoint
 * 
 * Usage:
 *   node test-mcp-client.js
 * 
 * Environment:
 *   API_KEY - Your TeamTape API key (or pass as argument)
 */

import fetch from 'node-fetch';

const MCP_ENDPOINT = process.env.MCP_ENDPOINT || 'http://localhost:7705/mcp';
const API_KEY = process.env.API_KEY || process.argv[2];

if (!API_KEY) {
    console.error('❌ Error: API_KEY not set');
    console.error('Usage: API_KEY=your-key node test-mcp-client.js');
    console.error('   or: node test-mcp-client.js your-key');
    process.exit(1);
}

let requestId = 1;

/**
 * Make MCP JSON-RPC request
 */
async function mcpRequest(method, params = {}) {
    console.log(`\n📤 Request: ${method}`);
    console.log(`   Params:`, JSON.stringify(params, null, 2));

    const payload = {
        jsonrpc: '2.0',
        method,
        params,
        id: requestId++,
    };

    try {
        const response = await fetch(MCP_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.error) {
            console.error(`❌ Error [${result.error.code}]:`, result.error.message);
            if (result.error.data) {
                console.error('   Details:', result.error.data);
            }
            return null;
        }

        console.log(`✅ Success`);
        return result.result;
    } catch (error) {
        console.error(`❌ Request failed:`, error.message);
        return null;
    }
}

/**
 * Main test workflow
 */
async function main() {
    console.log('='.repeat(60));
    console.log('TeamTape MCP Client Test');
    console.log('='.repeat(60));
    console.log(`Endpoint: ${MCP_ENDPOINT}`);
    console.log(`API Key: ${API_KEY.substring(0, 8)}...`);

    // Test 1: Initialize
    console.log('\n' + '='.repeat(60));
    console.log('Test 1: Initialize Connection');
    console.log('='.repeat(60));

    const serverInfo = await mcpRequest('initialize', {
        protocolVersion: '2024-11-05',
        clientInfo: {
            name: 'teamtape-test-client',
            version: '1.0.0',
        },
    });

    if (!serverInfo) {
        console.error('\n❌ Initialization failed. Stopping tests.');
        process.exit(1);
    }

    console.log('   Server:', serverInfo.serverInfo.name);
    console.log('   Version:', serverInfo.serverInfo.version);
    console.log('   Protocol:', serverInfo.protocolVersion);
    console.log('   Capabilities:');
    console.log('     - resources.list:', serverInfo.capabilities.resources.list);
    console.log('     - resources.read:', serverInfo.capabilities.resources.read);

    // Test 2: List Resources
    console.log('\n' + '='.repeat(60));
    console.log('Test 2: List Resources');
    console.log('='.repeat(60));

    const resourceList = await mcpRequest('resources/list', {});

    if (!resourceList) {
        console.error('\n❌ Resource listing failed. Stopping tests.');
        process.exit(1);
    }

    console.log(`   Found ${resourceList.resources.length} meetings`);

    if (resourceList.nextCursor) {
        console.log(`   Next cursor: ${resourceList.nextCursor}`);
    }

    // Display first 3 meetings
    const displayCount = Math.min(3, resourceList.resources.length);
    for (let i = 0; i < displayCount; i++) {
        const resource = resourceList.resources[i];
        console.log(`\n   Meeting ${i + 1}:`);
        console.log(`     URI: ${resource.uri}`);
        console.log(`     Name: ${resource.name}`);
        console.log(`     ID: ${resource.metadata.id}`);
        console.log(`     Duration: ${formatDuration(resource.metadata.duration)}`);
        console.log(`     Participants: ${resource.metadata.participantCount}`);
        console.log(`     Status: ${resource.metadata.status}`);
        console.log(`     Description: ${resource.description.substring(0, 80)}...`);
    }

    if (resourceList.resources.length > displayCount) {
        console.log(`\n   ... and ${resourceList.resources.length - displayCount} more`);
    }

    // Test 3: Read Resource (if available)
    if (resourceList.resources.length > 0) {
        console.log('\n' + '='.repeat(60));
        console.log('Test 3: Read Resource (First Meeting)');
        console.log('='.repeat(60));

        const firstMeeting = resourceList.resources[0];
        const content = await mcpRequest('resources/read', {
            uri: firstMeeting.uri,
        });

        if (content && content.contents && content.contents.length > 0) {
            const meetingContent = content.contents[0];
            console.log(`   URI: ${meetingContent.uri}`);
            console.log(`   MIME Type: ${meetingContent.mimeType}`);
            console.log(`   Content length: ${meetingContent.text.length} characters`);
            console.log('\n   Content preview:');
            console.log('   ' + '-'.repeat(56));

            // Show first 20 lines
            const lines = meetingContent.text.split('\n').slice(0, 20);
            lines.forEach(line => {
                console.log(`   ${line}`);
            });

            if (meetingContent.text.split('\n').length > 20) {
                console.log(`   ... (${meetingContent.text.split('\n').length - 20} more lines)`);
            }
            console.log('   ' + '-'.repeat(56));
        }
    } else {
        console.log('\n⚠️  No meetings available to read');
        console.log('   Record a meeting using the Discord bot first');
    }

    // Test 4: Ping
    console.log('\n' + '='.repeat(60));
    console.log('Test 4: Ping');
    console.log('='.repeat(60));

    const ping = await mcpRequest('ping', {});
    if (ping !== null) {
        console.log('   Pong! Server is responsive');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Test Summary');
    console.log('='.repeat(60));
    console.log('✅ All tests completed successfully!');
    console.log('\nNext steps:');
    console.log('  1. Connect this endpoint to MCPJungle or Claude Desktop');
    console.log('  2. Use the meeting URIs to access specific recordings');
    console.log('  3. Implement pagination using nextCursor if needed');
    console.log('\nSee MCP_IMPLEMENTATION.md for full documentation');
    console.log('='.repeat(60) + '\n');
}

/**
 * Format duration in seconds to human readable
 */
function formatDuration(seconds) {
    if (!seconds) return '0s';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
}

// Run tests
main().catch((error) => {
    console.error('\n💥 Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
});
