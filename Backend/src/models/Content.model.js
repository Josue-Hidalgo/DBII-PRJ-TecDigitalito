const mongoose = require('mongoose');

// Una sección puede tener múltiples contenidos de distintos tipos (HU-13):
// texto + 2 videos + imagen, etc. El campo `data` varía según el tipo.
const contentSchema = new mongoose.Schema({
  _id: { type: String, required: true },

  sectionId: { type: String, required: true },

  // Tipo de contenido (HU-13)
  tipo: {
    type:     String,
    enum:     ['texto', 'documento', 'video', 'imagen'],
    required: true,
  },

  // Orden dentro de la sección; permite tener 2 videos + texto en orden definido
  orden: { type: Number, default: 0 },

  // Payload variable según tipo:
  //   texto    → { texto: "..." }
  //   documento→ { url, nombre_archivo, mime_type }
  //   video    → { url, duracion_segundos, nombre_archivo }
  //   imagen   → { url, nombre_archivo, mime_type }
  data: {
    texto:             { type: String,  default: null },
    url:               { type: String,  default: null },
    nombre_archivo:    { type: String,  default: null },
    duracion_segundos: { type: Number,  default: null }, // solo videos
    mime_type:         { type: String,  default: null }, // documentos e imágenes
  },

  createdAt: { type: Date, default: Date.now },
}, { _id: false, timestamps: false });

// Para listar contenido de una sección (HU-23)
contentSchema.index({ sectionId: 1 });

module.exports = mongoose.model('Content', contentSchema);