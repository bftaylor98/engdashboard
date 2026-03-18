import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

function isEditor(req) {
  const u = req.user;
  return u && (u.username === 'admin' || u.username === 'brad');
}

function slugify(title) {
  return String(title)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function mapArticle(row, categoryName = null, ownerDisplayName = null) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    categoryId: row.category_id,
    categoryName: categoryName ?? row.category_name ?? null,
    tags: jsonParse(row.tags, []),
    summary: row.summary ?? null,
    body: row.body ?? null,
    status: row.status,
    ownerUserId: row.owner_user_id,
    ownerDisplayName: ownerDisplayName ?? row.owner_display_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewDueAt: row.review_due_at ?? null,
    viewsCount: row.views_count ?? 0,
    helpfulYes: row.helpful_yes ?? 0,
    helpfulNo: row.helpful_no ?? 0,
    attachments: jsonParse(row.attachments, []),
    relatedArticleIds: jsonParse(row.related_article_ids, []),
    pinned: Boolean(row.pinned),
  };
}

function jsonParse(str, fallback) {
  if (str == null || str === '') return fallback;
  try {
    const v = JSON.parse(str);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

// --- Categories ---

/**
 * GET /api/knowledge/categories
 * Flat list with parentId for frontend tree.
 */
router.get('/categories', (req, res) => {
  const db = req.db;
  try {
    const rows = db.prepare(
      'SELECT id, name, parent_id as parentId, sort_order as sortOrder FROM kb_categories ORDER BY sort_order ASC, name ASC'
    ).all();
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[knowledge] categories error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Articles (order: specific paths before /:id) ---

/**
 * GET /api/knowledge/recent
 * Recently updated for sidebar.
 */
router.get('/recent', (req, res) => {
  const db = req.db;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  try {
    const rows = db.prepare(
      `SELECT a.id, a.title, a.slug, a.category_id, a.status, a.updated_at,
              c.name as category_name,
              u.display_name as owner_display_name
       FROM kb_articles a
       LEFT JOIN kb_categories c ON c.id = a.category_id
       LEFT JOIN users u ON u.id = a.owner_user_id
       ORDER BY a.updated_at DESC LIMIT ?`
    ).all(limit);
    res.json({ success: true, data: rows.map((r) => mapArticle(r)) });
  } catch (err) {
    console.error('[knowledge] recent error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/knowledge/featured
 * Pinned + common questions (tag "faq" or category name containing "common").
 */
router.get('/featured', (req, res) => {
  const db = req.db;
  try {
    const pinned = db.prepare(
      `SELECT a.id, a.title, a.slug, a.summary, a.category_id, a.status, a.pinned,
              c.name as category_name, u.display_name as owner_display_name,
              a.updated_at, a.views_count, a.helpful_yes, a.helpful_no,
              a.attachments, a.related_article_ids
       FROM kb_articles a
       LEFT JOIN kb_categories c ON c.id = a.category_id
       LEFT JOIN users u ON u.id = a.owner_user_id
       WHERE a.pinned = 1 ORDER BY a.updated_at DESC`
    ).all();
    const faq = db.prepare(
      `SELECT a.id, a.title, a.slug, a.summary, a.category_id, a.status, a.pinned,
              c.name as category_name, u.display_name as owner_display_name,
              a.updated_at, a.views_count, a.helpful_yes, a.helpful_no,
              a.attachments, a.related_article_ids
       FROM kb_articles a
       LEFT JOIN kb_categories c ON c.id = a.category_id
       LEFT JOIN users u ON u.id = a.owner_user_id
       WHERE a.tags LIKE '%"faq"%' OR a.tags LIKE '%faq%'
       ORDER BY a.updated_at DESC LIMIT 10`
    ).all();
    res.json({
      success: true,
      data: {
        pinned: pinned.map((r) => mapArticle(r)),
        faq: faq.map((r) => mapArticle(r)),
      },
    });
  } catch (err) {
    console.error('[knowledge] featured error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/knowledge/attachments/:id/:filename
 * Serve attachment file (auth required). Must be before /:id.
 */
router.get('/attachments/:id/:filename', (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const id = req.params.id;
  const filename = req.params.filename;
  const filePath = path.join(kbUploadsDir, id, filename);
  if (!path.resolve(filePath).startsWith(path.resolve(kbUploadsDir)) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  res.sendFile(filePath);
});

/**
 * GET /api/knowledge/by-slug/:slug
 * Single article by slug; increment views_count.
 */
router.get('/by-slug/:slug', (req, res) => {
  const db = req.db;
  const slug = req.params.slug;
  try {
    const row = db.prepare(
      `SELECT a.*, c.name as category_name, u.display_name as owner_display_name
       FROM kb_articles a
       LEFT JOIN kb_categories c ON c.id = a.category_id
       LEFT JOIN users u ON u.id = a.owner_user_id
       WHERE a.slug = ?`
    ).get(slug);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }
    db.prepare('UPDATE kb_articles SET views_count = views_count + 1 WHERE id = ?').run(row.id);
    row.views_count = (row.views_count ?? 0) + 1;
    res.json({ success: true, data: mapArticle(row) });
  } catch (err) {
    console.error('[knowledge] by-slug error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/knowledge
 * List with q, categoryId, tags, status, ownerUserId, order (recent|views|helpful).
 */
router.get('/', (req, res) => {
  const db = req.db;
  const { q, categoryId, tags, status, ownerUserId, order } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  try {
    let whereClause = ' WHERE 1=1';
    const params = [];

    if (q && String(q).trim()) {
      const term = `%${String(q).trim().replace(/%/g, '\\%')}%`;
      whereClause += ' AND (a.title LIKE ? OR a.summary LIKE ? OR a.body LIKE ? OR a.tags LIKE ?)';
      params.push(term, term, term, term);
    }
    if (categoryId != null && categoryId !== '') {
      whereClause += ' AND a.category_id = ?';
      params.push(parseInt(categoryId, 10));
    }
    if (status && String(status).trim()) {
      whereClause += ' AND a.status = ?';
      params.push(String(status).trim());
    }
    if (ownerUserId && String(ownerUserId).trim()) {
      whereClause += ' AND a.owner_user_id = ?';
      params.push(String(ownerUserId).trim());
    }
    if (tags && String(tags).trim()) {
      const tagList = String(tags).split(',').map((t) => t.trim()).filter(Boolean);
      tagList.forEach((tag) => {
        whereClause += ' AND (a.tags LIKE ? OR a.tags LIKE ?)';
        params.push(`%"${tag}"%`, `%${tag}%`);
      });
    }

    const orderBy = order === 'views' ? 'a.views_count DESC' : order === 'helpful' ? '(a.helpful_yes + a.helpful_no) DESC, a.helpful_yes DESC' : 'a.updated_at DESC';
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM kb_articles a${whereClause}`).get(...params);
    const listSql = `SELECT a.id, a.title, a.slug, a.summary, a.category_id, a.status, a.owner_user_id,
      a.created_at, a.updated_at, a.views_count, a.helpful_yes, a.helpful_no,
      a.pinned, a.attachments, a.related_article_ids, a.tags,
      c.name as category_name, u.display_name as owner_display_name
      FROM kb_articles a
      LEFT JOIN kb_categories c ON c.id = a.category_id
      LEFT JOIN users u ON u.id = a.owner_user_id${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    const rows = db.prepare(listSql).all(...params, limit, offset);
    res.json({
      success: true,
      data: rows.map((r) => mapArticle(r)),
      pagination: { limit, offset, total: countRow?.total ?? 0 },
    });
  } catch (err) {
    console.error('[knowledge] list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/knowledge
 * Create article. Slug from title; default status draft; owner = current user.
 */
router.post('/', (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const db = req.db;
  const { title, categoryId, tags, summary, body, status: reqStatus } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }
  if (categoryId == null) {
    return res.status(400).json({ success: false, error: 'Category is required' });
  }
  const status = isEditor(req) && (reqStatus === 'reviewed' || reqStatus === 'standard') ? reqStatus : 'draft';
  let slug = slugify(title);
  if (!slug) slug = 'article';
  const now = new Date().toISOString();
  const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : (typeof tags === 'string' && tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : []));
  const bodyText = body != null ? String(body) : '';
  let finalSlug = slug;
  let n = 1;
  while (db.prepare('SELECT id FROM kb_articles WHERE slug = ?').get(finalSlug)) {
    finalSlug = `${slug}-${++n}`;
  }
  try {
    const result = db.prepare(
      `INSERT INTO kb_articles (title, slug, category_id, tags, summary, body, status, owner_user_id, created_at, updated_at, attachments, related_article_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]')`
    ).run(
      title.trim(),
      finalSlug,
      parseInt(categoryId, 10),
      tagsJson,
      summary != null ? String(summary).trim() : null,
      bodyText,
      status,
      req.user.id,
      now,
      now
    );
    const id = result.lastInsertRowid;
    db.prepare('INSERT INTO kb_revisions (article_id, user_id, snapshot, created_at, note) VALUES (?, ?, ?, ?, ?)').run(id, req.user.id, bodyText, now, 'Initial version');
    const row = db.prepare(
      `SELECT a.*, c.name as category_name, u.display_name as owner_display_name FROM kb_articles a
       LEFT JOIN kb_categories c ON c.id = a.category_id LEFT JOIN users u ON u.id = a.owner_user_id WHERE a.id = ?`
    ).get(id);
    res.status(201).json({ success: true, data: mapArticle(row) });
  } catch (err) {
    console.error('[knowledge] create error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/knowledge/:id
 * Update article. Revision on body change. Only editors can set status to reviewed/standard.
 */
router.patch('/:id', (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const db = req.db;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  const existing = db.prepare('SELECT id, owner_user_id, body, status FROM kb_articles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ success: false, error: 'Article not found' });
  const { title, categoryId, tags, summary, body, status: reqStatus, reviewDueAt } = req.body || {};
  const updates = [];
  const values = [];

  if (title !== undefined && typeof title === 'string') {
    updates.push('title = ?');
    values.push(title.trim());
  }
  if (categoryId !== undefined) {
    updates.push('category_id = ?');
    values.push(parseInt(categoryId, 10));
  }
  if (tags !== undefined) {
    const tagsArr = Array.isArray(tags) ? tags : (typeof tags === 'string' && tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : []);
    updates.push('tags = ?');
    values.push(JSON.stringify(tagsArr));
  }
  if (summary !== undefined) {
    updates.push('summary = ?');
    values.push(summary === null || summary === '' ? null : String(summary).trim());
  }
  if (body !== undefined) {
    updates.push('body = ?');
    values.push(String(body));
  }
  if (reqStatus !== undefined) {
    if (reqStatus === 'reviewed' || reqStatus === 'standard') {
      if (!isEditor(req)) {
        return res.status(403).json({ success: false, error: 'Only editors can promote to Reviewed or Standard' });
      }
    }
    updates.push('status = ?');
    values.push(String(reqStatus));
  }
  if (reviewDueAt !== undefined) {
    updates.push('review_due_at = ?');
    values.push(reviewDueAt === null || reviewDueAt === '' ? null : String(reviewDueAt));
  }

  if (updates.length === 0) {
    const row = db.prepare(
      `SELECT a.*, c.name as category_name, u.display_name as owner_display_name FROM kb_articles a
       LEFT JOIN kb_categories c ON c.id = a.category_id LEFT JOIN users u ON u.id = a.owner_user_id WHERE a.id = ?`
    ).get(id);
    return res.json({ success: true, data: mapArticle(row) });
  }

  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  values.push(now);
  values.push(id);

  try {
    if (body !== undefined && String(body) !== (existing.body || '')) {
      db.prepare('INSERT INTO kb_revisions (article_id, user_id, snapshot, created_at, note) VALUES (?, ?, ?, ?, ?)').run(id, req.user.id, String(body), now, 'Edit');
    }
    db.prepare(`UPDATE kb_articles SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const row = db.prepare(
      `SELECT a.*, c.name as category_name, u.display_name as owner_display_name FROM kb_articles a
       LEFT JOIN kb_categories c ON c.id = a.category_id LEFT JOIN users u ON u.id = a.owner_user_id WHERE a.id = ?`
    ).get(id);
    res.json({ success: true, data: mapArticle(row) });
  } catch (err) {
    console.error('[knowledge] update error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/knowledge/:id
 * Editors or owner only.
 */
router.delete('/:id', (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const db = req.db;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  const existing = db.prepare('SELECT id, owner_user_id FROM kb_articles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ success: false, error: 'Article not found' });
  if (!isEditor(req) && existing.owner_user_id !== req.user.id) {
    return res.status(403).json({ success: false, error: 'Only editors or article owner can delete' });
  }
  try {
    db.prepare('DELETE FROM kb_comments WHERE article_id = ?').run(id);
    db.prepare('DELETE FROM kb_revisions WHERE article_id = ?').run(id);
    db.prepare('DELETE FROM kb_articles WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[knowledge] delete error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/knowledge/:id/helpful
 * Body: { helpful: true | false }
 */
router.post('/:id/helpful', (req, res) => {
  const db = req.db;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  const helpful = req.body?.helpful === true;
  try {
    if (helpful) {
      db.prepare('UPDATE kb_articles SET helpful_yes = helpful_yes + 1 WHERE id = ?').run(id);
    } else {
      db.prepare('UPDATE kb_articles SET helpful_no = helpful_no + 1 WHERE id = ?').run(id);
    }
    const row = db.prepare('SELECT helpful_yes, helpful_no FROM kb_articles WHERE id = ?').get(id);
    res.json({ success: true, data: { helpfulYes: row.helpful_yes, helpfulNo: row.helpful_no } });
  } catch (err) {
    console.error('[knowledge] helpful error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/knowledge/:id/comments
 */
router.get('/:id/comments', (req, res) => {
  const db = req.db;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  try {
    const rows = db.prepare(
      `SELECT c.id, c.article_id, c.user_id, c.type, c.body, c.created_at, u.display_name as user_display_name
       FROM kb_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.article_id = ? ORDER BY c.created_at ASC`
    ).all(id);
    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        articleId: r.article_id,
        userId: r.user_id,
        userDisplayName: r.user_display_name,
        type: r.type,
        body: r.body,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('[knowledge] comments list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/knowledge/:id/comments
 * Body: { type: 'comment' | 'edit_suggestion', body: string }
 */
router.post('/:id/comments', (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const db = req.db;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  const article = db.prepare('SELECT id FROM kb_articles WHERE id = ?').get(id);
  if (!article) return res.status(404).json({ success: false, error: 'Article not found' });
  const { type, body } = req.body || {};
  const commentType = type === 'edit_suggestion' ? 'edit_suggestion' : 'comment';
  if (!body || typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ success: false, error: 'Body is required' });
  }
  const now = new Date().toISOString();
  try {
    const result = db.prepare(
      'INSERT INTO kb_comments (article_id, user_id, type, body, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, req.user.id, commentType, body.trim(), now);
    const row = db.prepare(
      `SELECT c.id, c.article_id, c.user_id, c.type, c.body, c.created_at, u.display_name as user_display_name
       FROM kb_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?`
    ).get(result.lastInsertRowid);
    res.status(201).json({
      success: true,
      data: {
        id: row.id,
        articleId: row.article_id,
        userId: row.user_id,
        userDisplayName: row.user_display_name,
        type: row.type,
        body: row.body,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error('[knowledge] comment create error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/knowledge/:id/revisions
 */
router.get('/:id/revisions', (req, res) => {
  const db = req.db;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  try {
    const rows = db.prepare(
      `SELECT r.id, r.article_id, r.user_id, r.snapshot, r.created_at, r.note, u.display_name as user_display_name
       FROM kb_revisions r LEFT JOIN users u ON u.id = r.user_id WHERE r.article_id = ? ORDER BY r.created_at DESC`
    ).all(id);
    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        articleId: r.article_id,
        userId: r.user_id,
        userDisplayName: r.user_display_name,
        snapshot: r.snapshot,
        createdAt: r.created_at,
        note: r.note ?? null,
      })),
    });
  } catch (err) {
    console.error('[knowledge] revisions error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Multer for attachment uploads
const kbUploadsDir = path.join(__dirname, '..', '..', 'uploads', 'kb');
if (!fs.existsSync(kbUploadsDir)) {
  fs.mkdirSync(kbUploadsDir, { recursive: true });
}
const kbStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = req.params.id;
    const dir = path.join(kbUploadsDir, String(id));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const uploadKb = multer({ storage: kbStorage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

/**
 * POST /api/knowledge/:id/attachments
 * Multipart file(s). Appends to article attachments.
 */
router.post('/:id/attachments', uploadKb.array('files', 5), (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const db = req.db;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  const article = db.prepare('SELECT id, attachments FROM kb_articles WHERE id = ?').get(id);
  if (!article) return res.status(404).json({ success: false, error: 'Article not found' });
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ success: false, error: 'No files uploaded' });
  }
  const attachments = jsonParse(article.attachments, []);
  const baseUrl = `/api/knowledge/attachments/${id}`;
  files.forEach((f) => {
    attachments.push({ name: f.originalname, path: f.filename, url: `${baseUrl}/${f.filename}` });
  });
  try {
    db.prepare('UPDATE kb_articles SET attachments = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(attachments),
      new Date().toISOString(),
      id
    );
    res.json({ success: true, data: attachments });
  } catch (err) {
    console.error('[knowledge] attachments error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
