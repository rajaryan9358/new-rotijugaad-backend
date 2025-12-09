const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/db');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

let JobProfile;
try {
  JobProfile = require('../models/JobProfile');
} catch (e) {
  console.error('[jobProfiles] Model import failed:', e.message);
}

async function ensureStructure() {
  if (!JobProfile) return;
  const qi = sequelize.getQueryInterface();
  let cols;
  try { cols = await qi.describeTable('job_profiles'); }
  catch {
    await qi.createTable('job_profiles', {
      id: { type: require('sequelize').INTEGER, primaryKey: true, autoIncrement: true },
      profile_english: { type: require('sequelize').STRING(150), allowNull: true }, // changed
      profile_hindi: { type: require('sequelize').STRING(150), allowNull: true }, // changed
      profile_image: { type: require('sequelize').STRING(255), allowNull: true }, // changed
      sequence: { type: require('sequelize').INTEGER, allowNull: true },
      is_active: { type: require('sequelize').BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: require('sequelize').DATE },
      updated_at: { type: require('sequelize').DATE },
      deleted_at: { type: require('sequelize').DATE }
    });
    return;
  }
  const needed = {
    profile_english: { type: require('sequelize').STRING(150), allowNull: true }, // changed
    profile_hindi: { type: require('sequelize').STRING(150), allowNull: true }, // changed
    profile_image: { type: require('sequelize').STRING(255), allowNull: true }, // changed
    sequence: { type: require('sequelize').INTEGER, allowNull: true },
    is_active: { type: require('sequelize').BOOLEAN, allowNull: false, defaultValue: true }
  };
  for (const k of Object.keys(needed)) {
    if (!cols[k]) await qi.addColumn('job_profiles', k, needed[k]);
  }
}

const uploadDir = path.join(process.cwd(), 'uploads', 'job-profiles');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.random().toString(36).slice(2);
    const ext = path.extname(file.originalname || '');
    cb(null, unique + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Invalid image file'));
    cb(null, true);
  }
});


/**
 * GET /api/masters/job-profiles
 * Retrieve all job profiles with sequence ordering.
 */
router.get('/', async (_req, res) => {
  if (!JobProfile) return res.status(500).json({ success: false, message: 'JobProfile model unavailable' });
  try {
    await ensureStructure();
    const rows = await JobProfile.findAll({
      order: [['sequence', 'ASC'], ['id', 'ASC']],
      paranoid: true
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[jobProfiles] list error:', err);
    // FALLBACK: raw SQL to check actual columns
    try {
      const [rawRows] = await sequelize.query('SELECT * FROM job_profiles WHERE deleted_at IS NULL ORDER BY sequence ASC, id ASC LIMIT 10');
      console.log('[jobProfiles] raw sample:', rawRows[0]);
      return res.status(500).json({ success: false, message: err.message, sample: rawRows[0] });
    } catch {}
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/masters/job-profiles/upload
 * Upload and store an image for a job profile.
 */
router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const relPath = `/uploads/job-profiles/${req.file.filename}`;
    const url = `${req.protocol}://${req.get('host')}${relPath}`;
    return res.json({ success: true, path: relPath, url });
  } catch (e) {
    console.error('[jobProfiles upload] error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * GET /api/masters/job-profiles/health
 * Return health diagnostics for the job profiles resource.
 */
router.get('/health', async (_req, res) => {
  if (!JobProfile) return res.status(500).json({ success: false, message: 'Model missing' });
  try {
    await ensureStructure();
    const count = await JobProfile.count();
    res.json({ success: true, count });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
