const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
  _id: { type: String, required: true },

  studentId: { type: String, required: true },
  courseId:  { type: String, required: true },
  enrolledAt: { type: Date, default: Date.now },

  // activo | completado | abandonado
  // Permite al docente (HU-16) y al grafo de Neo4j (HU-28) saber si el
  // estudiante está cursando actualmente o ya terminó / se fue.
  estado: {
    type:    String,
    enum:    ['activo', 'completado', 'abandonado'],
    default: 'activo',
  },

  // Progreso 0–100 para uso futuro (barra de avance en el frontend)
  progress: { type: Number, default: 0, min: 0, max: 100 },

}, { timestamps: false });

// Unicidad: un estudiante no puede matricularse dos veces al mismo curso (HU-21)
enrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
// Para listar estudiantes de un curso (HU-16) y compañeros (HU-27)
enrollmentSchema.index({ courseId: 1 });
// Para listar cursos del estudiante (HU-22)
enrollmentSchema.index({ studentId: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);