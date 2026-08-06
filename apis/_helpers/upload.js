const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeExt(originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  if (!ext) return '';
  // very small allowlist to avoid weird extensions
  if (!/^\.[a-z0-9]+$/.test(ext)) return '';
  return ext;
}

function createUploader(subDir) {
  const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      const relativeDir = path.posix.join('uploads', subDir);
      const absoluteDir = path.join(process.cwd(), relativeDir);
      ensureDirSync(absoluteDir);
      req._uploadRelativeDir = relativeDir;
      cb(null, absoluteDir);
    },
    filename: (req, file, cb) => {
      const ext = safeExt(file.originalname);
      const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      const relativeDir = req._uploadRelativeDir || path.posix.join('uploads', subDir);
      file.relativePath = path.posix.join(relativeDir, name);
      cb(null, name);
    },
  });

  return multer({ storage });
}

module.exports = {
  createUploader,
};
