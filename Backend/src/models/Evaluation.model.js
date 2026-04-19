const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  optionId: { type: String, required: true },
  text:     { type: String, required: true },
}, { _id: false });

const questionSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  text:       { type: String, required: true },

  // Orden de presentación definido por el docente (HU-14)
  orden: { type: Number, default: 0 },

  options:         [optionSchema],
  correctOptionId: { type: String, required: true },
}, { _id: false });

const evaluationSchema = new mongoose.Schema({
  _id: { type: String, required: true },

  courseId:  { type: String, required: true, index: true },
  teacherId: { type: String, required: true },

  title: { type: String, required: true },

  // Instrucciones opcionales antes del inicio (HU-14)
  descripcion: { type: String, default: null },

  startDate: { type: Date, required: true },
  endDate:   { type: Date, required: true },

  // Cuando false, el estudiante no puede ver ni acceder a la evaluación (HU-15).
  // Se activa al llegar startDate o manualmente por el docente.
  visible_para_estudiante: { type: Boolean, default: true },

  preguntas: [questionSchema],

}, { timestamps: true });

// Para filtrar evaluaciones activas de un curso (HU-24)
evaluationSchema.index({ courseId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Evaluation', evaluationSchema);