const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  studentId: { type: String, required: true },
  courseId: { type: String, required: true },
  enrolledAt: { type: Date, default: Date.now },
  progress: { type: Number, default: 0, min: 0, max: 100 },
}, { timestamps: false });

enrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
enrollmentSchema.index({ courseId: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);