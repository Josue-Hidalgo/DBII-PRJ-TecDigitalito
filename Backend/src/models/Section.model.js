const mongoose = require('mongoose');

// Colección separada para secciones, en lugar de embeberlas en el curso.
// Esto permite árboles de profundidad arbitraria (HU-12) y evita que el
// documento del curso crezca sin límite al agregar muchos subtemas.
const sectionSchema = new mongoose.Schema({
  _id: { type: String, required: true },

  courseId: { type: String, required: true },

  title:       { type: String, required: true, trim: true },

  // Descripción introductoria opcional por sección (HU-12)
  descripcion: { type: String, default: null },

  // null → sección raíz del curso; cualquier otro id → sub-sección (HU-12)
  parentSectionId: { type: String, default: null },

  // Orden dentro del nivel (entre hermanos con el mismo parent)
  orden: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
}, { _id: false, timestamps: false });

// Para construir el árbol completo de un curso (HU-23)
sectionSchema.index({ courseId: 1 });
// Para construir nivel por nivel (HU-12: agregar subtemas a un tema)
sectionSchema.index({ courseId: 1, parentSectionId: 1 });

module.exports = mongoose.model('Section', sectionSchema);