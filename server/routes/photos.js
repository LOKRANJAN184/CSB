const express = require('express');
const mongoose = require('mongoose');
const Photo = require('../models/Photo');
const { authenticate } = require('../middleware/auth');
const { badRequest, notFound, forbidden } = require('../lib/http');
const { upload, savePhoto } = require('../services/photos');

const router = express.Router();
router.use(authenticate);

// POST /api/photos  (multipart form, field name "photo") → { id }
router.post('/', upload.single('photo'), async (req, res) => {
  if (!req.file) throw badRequest('Choose an image file.');
  const photo = await savePhoto(req.file.buffer, req);
  res.status(201).json({ ok: true, id: photo._id, size: photo.size });
});

// GET /api/photos/:id → the image itself
router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
  const photo = await Photo.findById(req.params.id);
  if (!photo) throw notFound('Photo not found.');
  if (req.user.role === 'manager' && String(photo.branchId) !== String(req.branchId)) throw forbidden();
  res.set('Content-Type', photo.contentType);
  res.set('Cache-Control', 'private, max-age=31536000, immutable'); // photos never change
  res.send(photo.data);
});

module.exports = router;
