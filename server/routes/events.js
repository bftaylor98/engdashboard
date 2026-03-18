import { Router } from 'express';
import { eventBus } from '../lib/eventBus.js';

const router = Router();

/**
 * GET /api/events?token=<session_token>
 * 
 * SSE endpoint – streams real-time events to the browser.
 * Auth is handled via query-string token (EventSource doesn't support headers).
 */
router.get('/', (req, res) => {
  // Auth: verify token from query string
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const db = req.db;
  const session = db.prepare(
    `SELECT s.token, s.expires_at, u.id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
  ).get(token);

  if (!session || new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session' });
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering
  });

  // Send initial heartbeat
  res.write('event: connected\ndata: {}\n\n');

  // Keep-alive heartbeat every 30s
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 30000);

  // Create named handlers so we can remove them on disconnect
  const EVENT_NAMES = [
    'work-order:created',
    'work-order:updated',
    'work-order:deleted',
    'import:completed',
    'version:restored',
  ];

  const handlers = EVENT_NAMES.map((eventName) => {
    const handler = (data) => {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    eventBus.on(eventName, handler);
    return { eventName, handler };
  });

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    for (const { eventName, handler } of handlers) {
      eventBus.removeListener(eventName, handler);
    }
  });
});

export default router;
