const path = require('path');
const fs = require('fs');

let multer;
try {
  multer = require('multer');
} catch (e) {
  console.error('[selfieUpload] multer not installed. Run: npm i multer');
  module.exports = {
    handleSelfieUpload: (_req, res) => {
      res.status(500).json({ success: false, message: 'multer not installed on server' });
    }
  };
  return;
}

const SELFIE_DIR = path.join(process.cwd(), 'uploads', 'selfies');
if (!fs.existsSync(SELFIE_DIR)) {
  fs.mkdirSync(SELFIE_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, SELFIE_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    const base = path.basename(file.originalname || 'selfie', ext)
      .replace(/[^a-z0-9_-]/gi, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  }
});

const uploadSelfieMulter = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//i.test(file.mimetype)) {
      return cb(new Error('Invalid file type'));
    }
    cb(null, true);
  }
}).single('selfie');

function handleSelfieUpload(req, res) {
  uploadSelfieMulter(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const relativePath = `/uploads/selfies/${req.file.filename}`;
    const base = process.env.FILE_BASE_URL || '';
    return res.json({
      success: true,
      path: relativePath,
      url: base ? `${base}${relativePath}` : relativePath
    });
  });
}

module.exports = { handleSelfieUpload };
