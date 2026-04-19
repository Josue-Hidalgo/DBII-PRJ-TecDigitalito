const mongoose = require('mongoose');

// Hilo de consulta dentro de un curso
const courseThreadSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  courseId: { type: String, required: true, index: true },
  studentId: { type: String, default: null },
  teacherId: { type: String, required: true },
  subject: { type: String },
  status: { type: String, enum: ['open', 'answered', 'closed'], default: 'open' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false, timestamps: false });

// Mensaje dentro de un hilo de curso
const courseMessageSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  threadId: { type: String, required: true, index: true },
  courseId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  isTeacher: { type: Boolean, default: false },
  text: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
}, { _id: false, timestamps: false });

// Mensaje directo entre usuarios
const directMessageSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  conversationKey: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  recipientId: { type: String, required: true, index: true },
  text: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
  isRead: { type: Boolean, default: false },
}, { _id: false, timestamps: false });

// Conversación entre dos usuarios
const conversationSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  conversationKey: { type: String, required: true, unique: true },
  participants: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false, timestamps: false });

conversationSchema.index({ participants: 1 });

module.exports = {
  CourseThread: mongoose.model('CourseThread', courseThreadSchema),
  CourseMessage: mongoose.model('CourseMessage', courseMessageSchema),
  DirectMessage: mongoose.model('DirectMessage', directMessageSchema),
  Conversation: mongoose.model('Conversation', conversationSchema),
};