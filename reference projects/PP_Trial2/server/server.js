const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Parse JSON bodies (with or without Content-Type header for sendBeacon compatibility)
app.use(express.json({ type: ['application/json', 'text/plain', '*/*'] }));
app.use(express.static(path.join(__dirname, '..'))); // Serve HTML from parent directory

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Client-ID');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
fs.mkdir(logsDir, { recursive: true }).catch(err => {
    console.error('Error creating logs directory:', err);
});

// Per-file write queues to handle concurrent requests safely
const writeQueues = new Map();

/**
 * Get or create a write queue for a specific log file
 */
function getWriteQueue(filePath) {
    if (!writeQueues.has(filePath)) {
        writeQueues.set(filePath, Promise.resolve());
    }
    return writeQueues.get(filePath);
}

/**
 * Append to a file safely (handles concurrent writes)
 */
async function appendToFile(filePath, data) {
    const queue = getWriteQueue(filePath);
    
    // Chain the write operation to the queue
    const writePromise = queue.then(async () => {
        try {
            // Append to file
            await fs.appendFile(filePath, data, 'utf8');
        } catch (err) {
            console.error(`Error writing to ${filePath}:`, err);
            throw err;
        }
    });
    
    // Update the queue to point to the new promise
    writeQueues.set(filePath, writePromise);
    
    return writePromise;
}

/**
 * Sanitize work order number to safe filename
 */
function sanitizeFilename(wo) {
    if (!wo || typeof wo !== 'string') {
        return 'UNKNOWN';
    }
    // Replace invalid filename characters with underscore
    return wo.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'UNKNOWN';
}

/**
 * Format log entry as readable text (Eastern time, MM-DD-YY, 12-hour format)
 */
function formatLogEntry(entry, clientInfo) {
    const timestamp = formatEasternTime(entry.ts);
    
    // Only show client if it's not 'unknown'
    const clientStr = (clientInfo && clientInfo !== 'unknown') ? ` [Client: ${clientInfo}]` : '';
    return `${timestamp}${clientStr} | Field: ${entry.field} | Value: ${JSON.stringify(entry.value)}\n`;
}

/**
 * Format date/time in Eastern time, MM-DD-YY, 12-hour format (no ET suffix)
 */
function formatEasternTime(isoTimestamp) {
    try {
        const date = new Date(isoTimestamp);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.error('Invalid date:', isoTimestamp);
            return 'Invalid Date';
        }
        
        // Convert to Eastern time using Intl.DateTimeFormat
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        
        // Format the date parts
        const parts = formatter.formatToParts(date);
        const day = parts.find(p => p.type === 'day')?.value || '00';
        const month = parts.find(p => p.type === 'month')?.value || '00';
        const year = parts.find(p => p.type === 'year')?.value?.slice(-2) || '00';
        const hour = parts.find(p => p.type === 'hour')?.value || '00';
        const minute = parts.find(p => p.type === 'minute')?.value || '00';
        const second = parts.find(p => p.type === 'second')?.value || '00';
        const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || 'AM';
        
        // Format as MM-DD-YY (month first)
        return `${month}-${day}-${year} ${hour}:${minute}:${second} ${dayPeriod}`;
    } catch (err) {
        console.error('Error formatting Eastern time:', err, 'for timestamp:', isoTimestamp);
        // Fallback to ISO string if formatting fails
        return new Date(isoTimestamp).toISOString();
    }
}

/**
 * Format log entry as JSON object (for array)
 * ts = ISO timestamp (original), dateTime = formatted Eastern time
 */
function formatLogEntryJSON(entry, clientInfo) {
    const result = {
        dateTime: formatEasternTime(entry.ts), // Formatted: MM-DD-YY HH:MM:SS AM/PM
        ts: entry.ts, // Original ISO timestamp (for reference/sorting)
        field: entry.field,
        value: entry.value
    };
    
    // Only include client if it's not 'unknown'
    if (clientInfo && clientInfo !== 'unknown') {
        result.client = clientInfo;
    }
    
    return result;
}

/**
 * POST /log endpoint
 * Body: { wo: string, entries: Array<{ts, field, value}>, client?: string }
 */
app.post('/log', async (req, res) => {
    try {
        const { wo, entries, client } = req.body;
        
        // Get client identifier from request (header or body)
        const clientInfo = client || req.headers['x-client-id'] || req.ip || 'unknown';
        
        if (!wo || typeof wo !== 'string') {
            return res.status(400).json({ error: 'Missing or invalid "wo" field' });
        }
        
        if (!Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({ error: 'Missing or empty "entries" array' });
        }
        
        // Validate entries structure
        for (const entry of entries) {
            if (!entry.ts || !entry.field || entry.value === undefined) {
                return res.status(400).json({ 
                    error: 'Each entry must have ts, field, and value fields' 
                });
            }
        }
        
        // Sanitize work order to safe filename
        const safeWo = sanitizeFilename(wo);
        
        // Store in both formats:
        // 1. Human-readable text file
        const textLogPath = path.join(logsDir, `${safeWo}.txt`);
        // 2. JSON file (pretty formatted, readable)
        const jsonLogPath = path.join(logsDir, `${safeWo}.json`);
        
        // Format entries for text file (human-readable)
        let textLines;
        try {
            textLines = entries.map(entry => formatLogEntry(entry, clientInfo)).join('');
        } catch (err) {
            console.error('Error formatting text log entries:', err);
            throw err;
        }
        
        // Format entries for JSON file (pretty, readable array format)
        let jsonEntries;
        try {
            jsonEntries = entries.map(entry => formatLogEntryJSON(entry, clientInfo));
        } catch (err) {
            console.error('Error formatting JSON log entries:', err);
            throw err;
        }
        
        // Append to text file (simple append)
        try {
            await appendToFile(textLogPath, textLines);
        } catch (err) {
            console.error(`Error writing text log file ${textLogPath}:`, err);
            throw err;
        }
        
        // For JSON file, read existing, append, and write back (using queue for safety)
        const jsonQueue = getWriteQueue(jsonLogPath);
        const jsonWritePromise = jsonQueue.then(async () => {
            try {
                let existingJson = [];
                try {
                    const existingContent = await fs.readFile(jsonLogPath, 'utf8');
                    if (existingContent.trim()) {
                        existingJson = JSON.parse(existingContent.trim());
                        if (!Array.isArray(existingJson)) {
                            existingJson = [];
                        }
                    }
                } catch (readErr) {
                    // File doesn't exist or is invalid, start fresh
                    existingJson = [];
                }
                
                // Append new entries
                existingJson.push(...jsonEntries);
                const fullJsonContent = JSON.stringify(existingJson, null, 2) + '\n';
                await fs.writeFile(jsonLogPath, fullJsonContent, 'utf8');
            } catch (err) {
                console.error(`Error writing JSON log file ${jsonLogPath}:`, err);
                throw err;
            }
        });
        
        // Update the queue to point to the new promise
        writeQueues.set(jsonLogPath, jsonWritePromise);
        await jsonWritePromise;
        
        res.json({ success: true, logged: entries.length });
    } catch (err) {
        console.error('Error in /log endpoint:', err);
        res.status(500).json({ error: 'Internal server error', message: err.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Edit logging server running on http://0.0.0.0:${PORT}`);
    console.log(`Accessible at http://192.168.1.193:${PORT}`);
    console.log(`Logs directory: ${logsDir}`);
    console.log(`Serving HTML from: ${path.join(__dirname, '..')}`);
});

