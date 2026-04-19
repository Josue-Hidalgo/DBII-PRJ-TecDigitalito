const mongoose = require('mongoose');

const contentItemSchema = new mongoose.Schema({
  contentId: { type: String, required: true },
  type: { type: String, enum: ['text', 'document', 'video', 'image'], required: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const sectionSchema = new mongoose.Schema({
  sectionId: { type: String, required: true },
  title: { type: String, required: true },
  parentSectionId: { type: String, default: null },
  order: { type: Number, default: 0 },
  content: [contentItemSchema],
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const courseSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  code: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  teacherId: { type: String, required: true, index: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, default: null },
  photo: { type: String, default: null },
  isPublished: { type: Boolean, default: false, index: true },
  isActive: { type: Boolean, default: true },
  sections: [sectionSchema],
  enrolledCount: { type: Number, default: 0 },
  clonedFrom: { type: String, default: null },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

courseSchema.index({ name: 'text', description: 'text', code: 'text' });

module.exports = mongoose.model('Course', courseSchema);