const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');
let Story;
try {
  Story = require('../models/Story');
} catch (e) {
  console.error('[stories] Model import failed:', e.message);
}

// Ensure table & columns (similar to jobProfiles)
async function ensureStructure() {
  if (!sequelize) return;
  const qi = sequelize.getQueryInterface();
  const table = 'stories';
  let cols;
  try { cols = await qi.describeTable(table); }
  catch {
    await qi.createTable(table, {
      id: { type: require('sequelize').INTEGER, primaryKey: true, autoIncrement: true },
      user_type: { type: require('sequelize').STRING(50), allowNull: true },
      title_english: { type: require('sequelize').STRING(200), allowNull: true },
      title_hindi: { type: require('sequelize').STRING(200), allowNull: true },
      description_english: { type: require('sequelize').TEXT, allowNull: true },
      description_hindi: { type: require('sequelize').TEXT, allowNull: true },
      image: { type: require('sequelize').STRING(255), allowNull: true },
      expiry_at: { type: require('sequelize').DATE, allowNull: true },
      sequence: { type: require('sequelize').INTEGER, allowNull: true },
      is_active: { type: require('sequelize').BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: require('sequelize').DATE },
      updated_at: { type: require('sequelize').DATE },
      deleted_at: { type: require('sequelize').DATE }
    });
    return;
  }
  const needed = {
    user_type: { type: require('sequelize').STRING(50), allowNull: true },
    title_english: { type: require('sequelize').STRING(200), allowNull: true },
    title_hindi: { type: require('sequelize').STRING(200), allowNull: true },
    description_english: { type: require('sequelize').TEXT, allowNull: true },
    description_hindi: { type: require('sequelize').TEXT, allowNull: true },
    image: { type: require('sequelize').STRING(255), allowNull: true },
    expiry_at: { type: require('sequelize').DATE, allowNull: true },
    sequence: { type: require('sequelize').INTEGER, allowNull: true },
    is_active: { type: require('sequelize').BOOLEAN, allowNull: false, defaultValue: true }
  };
  for (const k of Object.keys(needed)) {
    if (!cols[k]) {
      await qi.addColumn(table, k, needed[k]);
    }
  }
}

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'stories');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = Date.now() + '-' + file.originalname.replace(/[^\w.-]+/g, '_');
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  }
});

// Helper to construct full URL from relative path
const toFullUrl = (req, relativePath) => {
  if (!relativePath) return relativePath;
  if (/^https?:\/\//.test(relativePath)) return relativePath;
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
};

// Request logger
router.use((req, _res, next) => {
  console.debug('[stories] ', req.method, req.originalUrl);
  next();
});

// size limit middlewares (like users.js)
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ limit: '10mb', extended: true }));

/**
 * GET /stories
 * List all stories.
 */
// GET /stories - List all stories
router.get('/', async (req, res) => {
  try {
    await ensureStructure();
    const fetchAll = String(req.query.all || '').toLowerCase() === 'true';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitParam = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(limitParam || 25, 1), 100);
    const sortableFields = new Set(['id', 'sequence', 'created_at', 'expiry_at', 'title_english']);
    const sortField = sortableFields.has(req.query.sortField) ? req.query.sortField : 'sequence';
    const sortDir = (req.query.sortDir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const where = {};
    const userType = (req.query.user_type || '').toLowerCase();
    if (userType) where.user_type = userType;

    const search = (req.query.search || '').trim();
    if (search) {
      const like = { [Op.like]: `%${search}%` };
      where[Op.or] = [
        { title_english: like },
        { title_hindi: like },
        { description_english: like },
        { description_hindi: like }
      ];
      const numeric = Number(search);
      if (!Number.isNaN(numeric)) where[Op.or].push({ id: numeric });
    }

    const order = [[sortField, sortDir]];
    if (sortField !== 'sequence') order.push(['sequence', 'ASC']);

    const queryOptions = { where, order, paranoid: true };
    let rows, total;
    if (fetchAll) {
      rows = await Story.findAll(queryOptions);
      total = rows.length;
    } else {
      queryOptions.limit = limit;
      queryOptions.offset = (page - 1) * limit;
      const result = await Story.findAndCountAll(queryOptions);
      rows = result.rows;
      total = result.count;
    }

    const data = rows.map((s) => {
      const plain = s.get({ plain: true });
      if (plain.image) plain.image = toFullUrl(req, plain.image);
      if (!plain.created_at && plain.createdAt) plain.created_at = plain.createdAt;
      return plain;
    });

    const meta = {
      page: fetchAll ? 1 : page,
      limit: fetchAll ? data.length : limit,
      total,
      totalPages: fetchAll ? 1 : Math.max(Math.ceil((total || 1) / limit), 1)
    };

    res.json({ success: true, data, meta });
  } catch (e) {
    console.error('[stories] list error:', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to load stories' });
  }
});

/**
 * POST /stories/upload/image
 * Upload a single story image and return its URL.
 */
// POST /stories/upload/image - Upload story image
router.post('/upload/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided' });
    const relPath = `/uploads/stories/${req.file.filename}`;
    const url = toFullUrl(req, relPath);
    res.json({ success: true, path: relPath, url });
  } catch (e) {
    console.error('Image upload error:', e);
    res.status(500).json({ success: false, message: e.message || 'Upload failed' });
  }
});

/**
 * POST /stories/upload
 * Upload a story asset via the legacy endpoint.
 */
// NEW: POST /stories/upload (parallel to jobProfiles upload)
router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const relPath = `/uploads/stories/${req.file.filename}`;
    const url = `${req.protocol}://${req.get('host')}${relPath}`;
    return res.json({ success: true, path: relPath, url });
  } catch (e) {
    console.error('[stories upload] error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * GET /stories/:id
 * Retrieve a single story by ID.
 */
// GET /stories/:id - Get single story
router.get('/:id', async (req, res) => {
  try {
    const s = await Story.findByPk(req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'Story not found' });
    const plain = s.get({ plain: true });
    if (plain.image) plain.image = toFullUrl(req, plain.image);
    if (!plain.created_at && plain.createdAt) plain.created_at = plain.createdAt;
    res.json({ success: true, data: plain });
  } catch (e) {
    console.error('[stories] fetch error:', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to load story' });
  }
});

/**
 * GET /stories/:id/check
 * Retrieve a story including soft-deleted records for debugging.
 */
// DEBUG check (raw, similar to users.js /:id/check)
router.get('/:id/check', async (req, res) => {
  try {
    const s = await Story.findByPk(req.params.id, { paranoid: false });
    if (!s) return res.status(404).json({ success: false, message: 'Story not found' });
    const plain = s.get({ plain: true });
    if (plain.image) plain.image = toFullUrl(req, plain.image);
    if (!plain.created_at && plain.createdAt) plain.created_at = plain.createdAt;
    res.json({ success: true, data: plain });
  } catch (e) {
    console.error('[stories] check error:', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to load story (check)' });
  }
});

/**
 * POST /stories
 * Create a new story.
 */
// POST /stories - Create story
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.user_type || !payload.title_english || !payload.description_english) {
      return res.status(400).json({ success: false, message: 'user_type, title_english, description_english are required' });
    }
    const s = await Story.create({
      user_type: String(payload.user_type).toLowerCase(),
      title_english: payload.title_english,
      title_hindi: payload.title_hindi || null,
      description_english: payload.description_english,
      description_hindi: payload.description_hindi || null,
      image: payload.image || null,
      expiry_at: payload.expiry_at || null,
      sequence: Number.isFinite(+payload.sequence) ? +payload.sequence : 0,
      is_active: typeof payload.is_active === 'boolean' ? payload.is_active : String(payload.is_active) !== 'false'
    });
    const plain = s.get({ plain: true });
    if (plain.image) plain.image = toFullUrl(req, plain.image);
    if (!plain.created_at && plain.createdAt) plain.created_at = plain.createdAt;
    res.status(201).json({ success: true, data: plain });
  } catch (e) {
    console.error('[stories] create error:', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to create story' });
  }
});

/**
 * PUT /stories/:id
 * Update an existing story by ID.
 */
// PUT /stories/:id - Update story
router.put('/:id', async (req, res) => {
  try {
    const s = await Story.findByPk(req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'Story not found' });

    const payload = req.body || {};
    await s.update({
      user_type: payload.user_type ? String(payload.user_type).toLowerCase() : s.user_type,
      title_english: payload.title_english ?? s.title_english,
      title_hindi: payload.title_hindi ?? s.title_hindi,
      description_english: payload.description_english ?? s.description_english,
      description_hindi: payload.description_hindi ?? s.description_hindi,
      image: payload.image ?? s.image,
      expiry_at: payload.expiry_at ?? s.expiry_at,
      sequence: payload.sequence !== undefined ? (+payload.sequence || 0) : s.sequence,
      is_active: payload.is_active !== undefined ? (typeof payload.is_active === 'boolean' ? payload.is_active : String(payload.is_active) !== 'false') : s.is_active
    });

    const plain = s.get({ plain: true });
    if (plain.image) plain.image = toFullUrl(req, plain.image);
    if (!plain.created_at && plain.createdAt) plain.created_at = plain.createdAt;
    res.json({ success: true, data: plain });
  } catch (e) {
    console.error('[stories] update error:', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to update story' });
  }
});

/**
 * DELETE /stories/:id
 * Soft delete a story by ID.
 */
// DELETE /stories/:id - Delete story
router.delete('/:id', async (req, res) => {
  try {
    const s = await Story.findByPk(req.params.id);
    if (!s) return res.status(404).json({ success: false, message: 'Story not found' });
    await s.destroy();
    res.json({ success: true, message: 'Story deleted successfully' });
  } catch (e) {
    console.error('[stories] delete error:', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to delete story' });
  }
});

/**
 * PUT /stories/bulk/sequence
 * Update sequence for multiple stories (drag & drop reordering).
 */
router.put('/bulk/sequence', async (req, res) => {
  try {
    const payload = req.body || {};
    const list = Array.isArray(payload.stories) ? payload.stories : [];
    if (!list.length) {
      return res.status(400).json({ success: false, message: 'stories array is required' });
    }

    // Normalize & validate
    const updates = list
      .map((item) => ({
        id: Number(item.id),
        sequence: Number(item.sequence),
      }))
      .filter((x) => Number.isInteger(x.id) && Number.isFinite(x.sequence));

    if (!updates.length) {
      return res.status(400).json({ success: false, message: 'Invalid stories payload' });
    }

    const ids = updates.map((u) => u.id);
    const existing = await Story.findAll({ where: { id: { [Op.in]: ids } }, paranoid: true });
    const existingMap = new Map(existing.map((s) => [s.id, s]));

    const tx = await sequelize.transaction();
    try {
      for (const { id, sequence } of updates) {
        const row = existingMap.get(id);
        if (!row) continue;
        await row.update({ sequence }, { transaction: tx });
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    // Return updated rows ordered by sequence then created_at
    const refreshed = await Story.findAll({
      where: { id: { [Op.in]: ids } },
      order: [
        ['sequence', 'ASC'],
        ['created_at', 'DESC'],
      ],
      paranoid: true,
    });

    const data = refreshed.map((s) => {
      const plain = s.get({ plain: true });
      if (plain.image) plain.image = toFullUrl(req, plain.image);
      if (!plain.created_at && plain.createdAt) plain.created_at = plain.createdAt;
      return plain;
    });

    return res.json({ success: true, data });
  } catch (e) {
    console.error('[stories] bulk sequence error:', e);
    return res.status(500).json({ success: false, message: e.message || 'Failed to update sequence' });
  }
});

/**
 * GET /stories/health
 * Provide a health check and story count.
 */
// Diagnostic /stories/health
router.get('/health', async (_req, res) => {
  try {
    await ensureStructure();
    const count = await Story.count();
    res.json({ success: true, count });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
