/**
 * Authentication middleware – validates Bearer token from the sessions table.
 * Attaches `req.user` ({ id, username, displayName }) on success.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  let token = null;

  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (req.query && req.query.token) {
    // Fallback: accept token via query string (used by export download links)
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const db = req.db;

  const session = db.prepare(
    `SELECT s.token, s.expires_at, u.id, u.username, u.display_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`
  ).get(token);

  if (!session) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session' });
  }

  if (new Date(session.expires_at) < new Date()) {
    // Clean up expired token
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ success: false, error: 'Session expired' });
  }

  req.user = {
    id: session.id,
    username: session.username,
    displayName: session.display_name,
  };

  next();
}

