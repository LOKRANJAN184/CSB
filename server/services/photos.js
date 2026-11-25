const multer = require('multer');
const sharp = require('sharp');
const Photo = require('../models/Photo');

// Multer reads the uploaded file into memory (req.file.buffer).
// The phone app already shrinks photos before uploading, and Vercel rejects
// request bodies above ~4.5 MB, so 4 MB is a sensible limit.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

/** Compress an uploaded image to WebP and store it in MongoDB. */
async function savePhoto(buffer, req) {
  const data = await sharp(buffer)
    .rotate() // respect the phone camera's EXIF orientation
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  return Photo.create({
    branchId: req.branchId !== 'all' ? req.branchId : undefined,
    data,
    size: data.length,
    uploadedBy: { userId: String(req.user.id), name: req.user.name, role: req.user.role },
  });
}

module.exports = { upload, savePhoto };
