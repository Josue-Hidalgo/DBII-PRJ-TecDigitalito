const mongoose = require('mongoose');

// Respuesta individual a una pregunta
const respuestaSchema = new mongoose.Schema({
  questionId:      { type: String, required: true },
  // Texto de la pregunta desnormalizado para mostrarlo sin join (HU-25)
  questionText:    { type: String, default: null },
  selectedOptionId: { type: String, default: null },
  correctOptionId: { type: String, required: true },
  isCorrect:       { type: Boolean, required: true },
}, { _id: false });

const evalAttemptSchema = new mongoose.Schema({
  _id: { type: String, required: true },

  studentId:    { type: String, required: true },
  evalId:       { type: String, required: true },

  // courseId desnormalizado: evita join con evaluations para consultar
  // todas las notas del estudiante en un curso (HU-25)
  courseId:     { type: String, required: true },

  respuestas:   [respuestaSchema],

  // Calculados al momento del submit → resultado inmediato (HU-24)
  correctas:        { type: Number, required: true },
  total_preguntas:  { type: Number, required: true },
  calificacion:     { type: Number, required: true, min: 0, max: 100 },

  submittedAt: { type: Date, default: Date.now },
}, { timestamps: false });

// Un estudiante solo puede intentar una evaluación una vez (HU-24)
evalAttemptSchema.index({ studentId: 1, evalId: 1 }, { unique: true });
// Para listar todas las notas del estudiante en un curso (HU-25)
evalAttemptSchema.index({ studentId: 1, courseId: 1 });

module.exports = mongoose.model('EvalAttempt', evalAttemptSchema);