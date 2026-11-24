const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../uploads/bills');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer memory storage so we can compress with Sharp before writing to disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Allow images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WEBP) are allowed for expense bills!'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max incoming photo from phone camera
  },
});

/**
 * Compress and save image to file storage
 * Returns { photoUrl, photoFilename }
 */
const compressAndSavePhoto = async (fileBuffer, originalName = 'bill.jpg') => {
  const filename = `bill-${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`;
  const destinationPath = path.join(uploadDir, filename);

  // Compress with Sharp: max width 1600px, quality 80, webp format for optimal compression & sharpness
  await sharp(fileBuffer)
    .rotate() // auto-orient based on EXIF camera orientation
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(destinationPath);

  const photoUrl = `/uploads/bills/${filename}`;
  return {
    photoUrl,
    photoFilename: filename,
  };
};

/**
 * Remove photo file from disk
 */
const removePhotoFile = async (filename) => {
  if (!filename) return;
  const filePath = path.join(uploadDir, path.basename(filename));
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(`[UploadService] Deleted file: ${filePath}`);
    }
  } catch (err) {
    console.error(`[UploadService] Error deleting file ${filePath}:`, err.message);
  }
};

module.exports = {
  upload,
  compressAndSavePhoto,
  removePhotoFile,
};

