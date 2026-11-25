const mongoose = require('mongoose');

// Bill photos are stored INSIDE MongoDB (already compressed to ~100 KB WebP).
// Why not on disk? Vercel servers are read-only and wiped between requests,
// so files written to disk there disappear. MongoDB documents can hold up to
// 16 MB, which is plenty for a compressed photo.
const photoSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    contentType: { type: String, default: 'image/webp' },
    data: { type: Buffer, required: true },
    size: Number,
    uploadedBy: { userId: String, name: String, role: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Photo', photoSchema);
