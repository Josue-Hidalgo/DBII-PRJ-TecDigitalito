const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  optionId: { type: String, required: true },
  text: { type: String, required: true },
}, { _id: false });

const questionSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  text: { type: String, required: true },
  options: [optionSchema],
  correctOptionId: { type: String, required: true },
}, { _id: false });

const evaluationSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  courseId: { type: String, required: true, index: true },
  teacherId: { type: String, required: true },
  title: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  questions: [questionSchema],
}, { timestamps: true });

module.exports = mongoose.model('Evaluation', evaluationSchema);