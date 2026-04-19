const mongoose = require('mongoose');

// Las secciones y contenidos ya NO se embeben aquí.
// Viven en sus propias colecciones (Section, Content) para soportar
// árboles de profundidad arbitraria sin inflar el documento (HU-12, HU-13).
const courseSchema = new mongoose.Schema({
  _id: { type: String, required: true },

  codigo:      { type: String, required: true, unique: true, trim: true },
  nombre:      { type: String, required: true, trim: true },
  descripcion: { type: String, required: true },

  // Docente propietario del curso (HU-11, HU-18)
  docente: {
    user_id: { type: String, required: true },
    // Nombre desnormalizado para evitar join al listar cursos (HU-18, HU-28)
    nombre:  { type: String, required: true },
  },

  fecha_inicio: { type: Date,   required: true },
  // null → curso siempre disponible (HU-11, criterio v)
  fecha_fin:    { type: Date,   default: null },

  foto: { type: String, default: null },

  // false → invisible para estudiantes durante edición (HU-15)
  publicado: { type: Boolean, default: false, index: true },

  // borrador | activo | terminado (HU-18)
  estado: {
    type:    String,
    enum:    ['borrador', 'activo', 'terminado'],
    default: 'borrador',
  },

  // null si es original; referencia al curso fuente si fue clonado (HU-19)
  original_course_id: { type: String, default: null },

  publishedAt: { type: Date, default: null },

}, { timestamps: true });

// Para listar cursos del docente (HU-18)
courseSchema.index({ 'docente.user_id': 1 });
// Para búsqueda de cursos publicados (HU-20)
courseSchema.index({ publicado: 1, nombre: 1 });
// Búsqueda de texto completo sobre nombre, descripción y código (HU-20)
courseSchema.index({ nombre: 'text', descripcion: 'text', codigo: 'text' });

module.exports = mongoose.model('Course', courseSchema);