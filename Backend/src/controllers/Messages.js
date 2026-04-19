// HU-17: Consultas docente-estudiante dentro de un curso
// HU-26: Estudiante envía consulta al docente
// HU-30: Mensajes privados entre usuarios
const { getMongoDB } = require("../config/mongodb");
const { getRedisClient } = require("../config/redis");
const { getCassandraClient } = require("../config/cassandra");
const crypto = require("crypto");

// ──────────────────────────────────────────────────────────────────────────────
// HU-17 / HU-26: Consultas dentro de un curso (docente ↔ estudiante)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Envía una consulta de un estudiante al docente de un curso.
 * También sirve para que el docente responda (fromTeacher: true).
 *
 * - MongoDB: hilo de consulta (thread) y mensajes del hilo
 * - Redis: contador de mensajes no leídos en tiempo real
 * - Cassandra: auditoría
 */
async function sendCourseQuery({ courseId, senderId, text, threadId = null }) {
  const mongo = await getMongoDB();
  const redis = getRedisClient();
  const cassandra = getCassandraClient();

  const course = await mongo.collection("courses").findOne({ _id: courseId });
  if (!course) throw new Error("Curso no encontrado.");

  // Verificar que el sender sea el docente o un estudiante matriculado
  const isTeacher = course.teacherId === senderId;
  if (!isTeacher) {
    const enrollment = await mongo.collection("enrollments").findOne({ studentId: senderId, courseId });
    if (!enrollment) throw new Error("No estás matriculado en este curso.");
  }

  const now = new Date();
  let resolvedThreadId = threadId;

  // Crear nuevo hilo si no existe
  if (!resolvedThreadId) {
    resolvedThreadId = crypto.randomUUID();
    await mongo.collection("courseThreads").insertOne({
      _id: resolvedThreadId,
      courseId,
      studentId: isTeacher ? null : senderId,
      teacherId: course.teacherId,
      subject: text.substring(0, 100),
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  }

  const messageId = crypto.randomUUID();
  await mongo.collection("courseMessages").insertOne({
    _id: messageId,
    threadId: resolvedThreadId,
    courseId,
    senderId,
    isTeacher,
    text,
    sentAt: now,
  });

  // Actualizar updatedAt del hilo
  await mongo.collection("courseThreads").updateOne(
    { _id: resolvedThreadId },
    { $set: { updatedAt: now, status: isTeacher ? "answered" : "open" } }
  );

  // ─── Redis: incrementar contador de no leídos para el receptor ──────────
  const recipientId = isTeacher ? await getStudentIdFromThread(mongo, resolvedThreadId, course.teacherId) : course.teacherId;
  await redis.incr(`unread:course:${recipientId}:${courseId}`);
  await redis.expire(`unread:course:${recipientId}:${courseId}`, 60 * 60 * 24 * 7);

  await cassandra.execute(
    `INSERT INTO audit_log (event_id, event_type, user_id, username, timestamp, details, ip_address)
     VALUES (uuid(), 'COURSE_MESSAGE_SENT', ?, 'user', toTimestamp(now()), ?, '0.0.0.0')`,
    [senderId, JSON.stringify({ courseId, threadId: resolvedThreadId, messageId })],
    { prepare: true }
  );

  return { messageId, threadId: resolvedThreadId };
}

async function getStudentIdFromThread(mongo, threadId, teacherId) {
  const thread = await mongo.collection("courseThreads").findOne({ _id: threadId });
  return thread?.studentId ?? teacherId;
}

/**
 * Obtiene los hilos de consulta de un curso.
 * - Si es docente: ve todos los hilos del curso.
 * - Si es estudiante: ve solo sus propios hilos.
 */
async function getCourseThreads({ courseId, userId }) {
  const mongo = await getMongoDB();

  const course = await mongo.collection("courses").findOne({ _id: courseId });
  if (!course) throw new Error("Curso no encontrado.");

  const isTeacher = course.teacherId === userId;
  const filter = isTeacher ? { courseId } : { courseId, studentId: userId };

  const threads = await mongo
    .collection("courseThreads")
    .find(filter)
    .sort({ updatedAt: -1 })
    .toArray();

  return threads;
}

/**
 * Obtiene los mensajes de un hilo de consulta.
 */
async function getThreadMessages({ threadId, userId }) {
  const mongo = await getMongoDB();
  const redis = getRedisClient();

  const thread = await mongo.collection("courseThreads").findOne({ _id: threadId });
  if (!thread) throw new Error("Hilo no encontrado.");

  const isParticipant = thread.teacherId === userId || thread.studentId === userId;
  if (!isParticipant) throw new Error("No tienes acceso a este hilo.");

  const messages = await mongo
    .collection("courseMessages")
    .find({ threadId })
    .sort({ sentAt: 1 })
    .toArray();

  // ─── Redis: limpiar contador de no leídos ────────────────────────────────
  await redis.del(`unread:course:${userId}:${thread.courseId}`);

  return messages;
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-30: Mensajes privados entre usuarios
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Envía un mensaje directo a otro usuario.
 * - MongoDB: almacena el mensaje y la conversación
 * - Redis: contador de no leídos en tiempo real por usuario
 */
async function sendDirectMessage({ senderId, recipientId, text }) {
  const mongo = await getMongoDB();
  const redis = getRedisClient();
  const cassandra = getCassandraClient();

  const recipient = await mongo.collection("users").findOne({ _id: recipientId });
  if (!recipient) throw new Error("Usuario destinatario no encontrado.");

  // Clave de conversación: siempre el menor ID primero para unicidad
  const conversationKey = [senderId, recipientId].sort().join(":");
  const now = new Date();

  // Crear o actualizar la conversación
  await mongo.collection("conversations").updateOne(
    { conversationKey },
    {
      $set: { updatedAt: now, participants: [senderId, recipientId] },
      $setOnInsert: { _id: crypto.randomUUID(), conversationKey, createdAt: now },
    },
    { upsert: true }
  );

  const messageId = crypto.randomUUID();
  await mongo.collection("directMessages").insertOne({
    _id: messageId,
    conversationKey,
    senderId,
    recipientId,
    text,
    sentAt: now,
    isRead: false,
  });

  // ─── Redis: incrementar no leídos del receptor ───────────────────────────
  await redis.incr(`unread:dm:${recipientId}`);
  await redis.expire(`unread:dm:${recipientId}`, 60 * 60 * 24 * 30);

  await cassandra.execute(
    `INSERT INTO audit_log (event_id, event_type, user_id, username, timestamp, details, ip_address)
     VALUES (uuid(), 'DIRECT_MESSAGE_SENT', ?, 'user', toTimestamp(now()), ?, '0.0.0.0')`,
    [senderId, JSON.stringify({ recipientId, messageId })],
    { prepare: true }
  );

  return { messageId, conversationKey, sentAt: now };
}

/**
 * Obtiene los mensajes de una conversación entre dos usuarios.
 */
async function getDirectMessages({ userId, otherUserId, limit = 50 }) {
  const mongo = await getMongoDB();
  const redis = getRedisClient();

  const conversationKey = [userId, otherUserId].sort().join(":");

  const messages = await mongo
    .collection("directMessages")
    .find({ conversationKey })
    .sort({ sentAt: -1 })
    .limit(limit)
    .toArray();

  // Marcar como leídos los mensajes recibidos
  await mongo.collection("directMessages").updateMany(
    { conversationKey, recipientId: userId, isRead: false },
    { $set: { isRead: true } }
  );

  // ─── Redis: resetear contador de no leídos ───────────────────────────────
  await redis.del(`unread:dm:${userId}`);

  return messages.reverse();
}

/**
 * Lista todas las conversaciones del usuario con el último mensaje.
 */
async function getConversations({ userId }) {
  const mongo = await getMongoDB();
  const redis = getRedisClient();

  const conversations = await mongo
    .collection("conversations")
    .find({ participants: userId })
    .sort({ updatedAt: -1 })
    .toArray();

  const unreadCount = parseInt(await redis.get(`unread:dm:${userId}`) || "0");

  // Enriquecer con datos del otro participante
  const enriched = await Promise.all(
    conversations.map(async (conv) => {
      const otherId = conv.participants.find((p) => p !== userId);
      const other = await mongo
        .collection("users")
        .findOne({ _id: otherId }, { projection: { fullName: 1, username: 1, photo: 1 } });

      const lastMessage = await mongo
        .collection("directMessages")
        .findOne({ conversationKey: conv.conversationKey }, { sort: { sentAt: -1 } });

      return {
        conversationKey: conv.conversationKey,
        other: other ? { userId: other._id, fullName: other.fullName, username: other.username } : null,
        lastMessage: lastMessage ? { text: lastMessage.text, sentAt: lastMessage.sentAt } : null,
        updatedAt: conv.updatedAt,
      };
    })
  );

  return { conversations: enriched, totalUnread: unreadCount };
}

module.exports = {
  sendCourseQuery,
  getCourseThreads,
  getThreadMessages,
  sendDirectMessage,
  getDirectMessages,
  getConversations,
};