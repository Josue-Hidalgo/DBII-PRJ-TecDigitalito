const mongoose = require('mongoose');

// ── Hilo de consulta dentro de un curso (HU-17 / HU-26) ──────────────────────
// Un estudiante abre un hilo; el docente responde dentro del mismo hilo.
const courseThreadSchema = new mongoose.Schema({
  _id:       { type: String, required: true },
  courseId:  { type: String, required: true, index: true },
  studentId: { type: String, default: null },
  teacherId: { type: String, required: true },
  subject:   { type: String, default: null },
  status: {
    type:    String,
    enum:    ['open', 'answered', 'closed'],
    default: 'open',
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false, timestamps: false });

// Para filtrar hilos por estudiante en la vista del docente (HU-17)
courseThreadSchema.index({ courseId: 1, studentId: 1 });


// ── Mensaje dentro de un hilo de curso ───────────────────────────────────────
const courseMessageSchema = new mongoose.Schema({
  _id:      { type: String, required: true },
  threadId: { type: String, required: true, index: true },
  courseId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  // Nombre desnormalizado para evitar join al renderizar la lista (HU-17)
  sender_nombre: { type: String, required: true },
  isTeacher: { type: Boolean, default: false },
  contenido: { type: String, required: true },
  // Permite al docente identificar consultas no atendidas (HU-17)
  leido:    { type: Boolean, default: false },
  sentAt:   { type: Date, default: Date.now },
}, { _id: false, timestamps: false });


// ── Mensaje directo entre usuarios (HU-30) ───────────────────────────────────
const directMessageSchema = new mongoose.Schema({
  _id:            { type: String, required: true },
  conversationKey: { type: String, required: true, index: true },
  senderId:       { type: String, required: true },
  recipientId:    { type: String, required: true, index: true },
  // Nombre desnormalizado para la bandeja de entrada sin join (HU-30)
  sender_nombre:  { type: String, required: true },
  contenido:      { type: String, required: true },
  // Threading: referencia al mensaje que se está respondiendo (HU-30)
  respuesta_a:    { type: String, default: null },
  leido:          { type: Boolean, default: false },
  sentAt:         { type: Date, default: Date.now },
}, { _id: false, timestamps: false });


// ── Conversación entre dos usuarios ──────────────────────────────────────────
// Registro de que existe una conversación; el contenido está en DirectMessage.
const conversationSchema = new mongoose.Schema({
  _id:             { type: String, required: true },
  conversationKey: { type: String, required: true, unique: true },
  participants:    [{ type: String }],
  // Último preview para bandeja de entrada sin consultar todos los mensajes
  lastPreview:     { type: String, default: '' },
  lastMessageAt:   { type: Date, default: Date.now },
  createdAt:       { type: Date, default: Date.now },
  updatedAt:       { type: Date, default: Date.now },
}, { _id: false, timestamps: false });

conversationSchema.index({ participants: 1 });

module.exports = {
  CourseThread:   mongoose.model('CourseThread',   courseThreadSchema),
  CourseMessage:  mongoose.model('CourseMessage',  courseMessageSchema),
  DirectMessage:  mongoose.model('DirectMessage',  directMessageSchema),
  Conversation:   mongoose.model('Conversation',   conversationSchema),
};