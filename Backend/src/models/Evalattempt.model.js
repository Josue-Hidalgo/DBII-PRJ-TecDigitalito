const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  questionText: { type: String },
  selectedOptionId: { type: String, default: null },
  correctOptionId: { type: String },
  isCorrect: { type: Boolean, required: true },
}, { _id: false });

const evalAttemptSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  studentId: { type: String, required: true },
  evalId: { type: String, required: true },
  courseId: { type: String, required: true },
  answers: [answerSchema],
  correct: { type: Number, required: true },
  total: { type: Number, required: true },
  score: { type: Number, required: true, min: 0, max: 100 },
  submittedAt: { type: Date, default: Date.now },
}, { timestamps: false });

evalAttemptSchema.index({ studentId: 1, evalId: 1 }, { unique: true });
evalAttemptSchema.index({ studentId: 1, courseId: 1 });

module.exports = mongoose.model('EvalAttempt', evalAttemptSchema);