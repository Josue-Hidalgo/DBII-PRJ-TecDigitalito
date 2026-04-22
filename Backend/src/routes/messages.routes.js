const express = require('express');
const router = express.Router();
const {
  sendCourseQuery,
  getCourseThreads,
  getThreadMessages,
  sendDirectMessage,
  getDirectMessages,
  getConversations,
} = require('../controllers/Message.controller');

// ── Mensajes dentro de un curso (HU-17 / HU-26) ──────────────────────────────

// HU-26 — Estudiante envía consulta; HU-17 — Docente responde en el mismo hilo
router.post('/course', sendCourseQuery);

// HU-17 — Ver todos los hilos de consulta de un curso (vista docente/estudiante)
router.get('/course/:courseId/threads', getCourseThreads);

// HU-17 — Ver mensajes dentro de un hilo específico
router.get('/thread/:threadId', getThreadMessages);

// ── Mensajes directos entre usuarios (HU-30) ─────────────────────────────────

// HU-30 — Enviar un mensaje directo a otro usuario
router.post('/direct', sendDirectMessage);

// HU-30 — Ver conversación entre dos usuarios
router.get('/direct/:userId/:otherUserId', getDirectMessages);

// HU-30 — Ver lista de todas las conversaciones del usuario
router.get('/conversations/:userId', getConversations);

module.exports = router;
