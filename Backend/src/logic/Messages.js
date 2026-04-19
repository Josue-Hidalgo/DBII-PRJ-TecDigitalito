/**
 * Messages.js — Lógica de negocio para mensajería dentro de cursos.
 *
 * HU-17: Docente recibe y responde consultas de estudiantes a través de hilos.
 * HU-26: Estudiante envía consultas al docente y recibe respuestas.
 *
 * Nota: Los mensajes directos entre usuarios (HU-30) ya están implementados
 * en Social.js. Este archivo gestiona exclusivamente la mensajería dentro
 * del contexto de un curso (CourseThread + CourseMessage).
 */

const { v4: uuidv4 } = require('uuid');
const { CourseThread, CourseMessage } = require('../models/Messages.model');
const Enrollment = require('../models/Enrollment.model');
const Course     = require('../models/Course.model');
const User       = require('../models/User.model');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve el usuario o lanza error si no existe.
 */
const getUser = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error('Usuario no encontrado.');
  return user;
};

/**
 * Devuelve el curso o lanza error si no existe.
 */
const getCourse = async (courseId) => {
  const course = await Course.findById(courseId).lean();
  if (!course) throw new Error('Curso no encontrado.');
  return course;
};

/**
 * Verifica que el usuario esté matriculado activamente en el curso.
 */
const assertEnrolled = async (courseId, studentId) => {
  const enrollment = await Enrollment.findOne({
    courseId,
    studentId,
    estado: 'activo',
  }).lean();
  if (!enrollment) {
    throw new Error('No estás matriculado activamente en este curso.');
  }
  return enrollment;
};

/**
 * Verifica si un usuario es docente del curso.
 */
const isTeacher = (course, userId) =>
  course.profesorId === userId || course.docente?.user_id === userId;

/**
 * Verifica que el usuario tenga acceso al hilo:
 * - Es el estudiante que lo creó, o
 * - Es el docente del curso.
 */
const assertThreadAccess = async (thread, userId) => {
  if (!thread) throw new Error('Hilo no encontrado.');
  const course = await getCourse(thread.courseId);
  const teacherAccess = isTeacher(course, userId);
  const studentAccess = thread.studentId === userId;
  if (!teacherAccess && !studentAccess) {
    throw new Error('No tienes acceso a este hilo.');
  }
  return { course, isDocente: teacherAccess };
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-26 — Estudiante envía consulta (o continúa hilo)
// HU-17 — Docente responde en el mismo endpoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envía un mensaje dentro de un curso.
 *
 * - Si `threadId` es null → se crea un nuevo hilo (solo estudiantes pueden abrir hilos nuevos).
 * - Si `threadId` existe → se agrega el mensaje al hilo (estudiante o docente).
 *
 * @param {object} params
 * @param {string} params.courseId
 * @param {string} params.senderId
 * @param {string} params.text
 * @param {string|null} [params.threadId]  - null para nuevo hilo
 * @returns {Promise<{ threadId, messageId, message }>}
 */
const sendCourseQuery = async ({ courseId, senderId, text, threadId = null }) => {
  if (!text || !text.trim()) throw new Error('El mensaje no puede estar vacío.');

  const course = await getCourse(courseId);
  const sender = await getUser(senderId);
  const senderIsTeacher = isTeacher(course, senderId);

  // ── Caso 1: nuevo hilo ───────────────────────────────────────────────────
  if (!threadId) {
    // Solo estudiantes pueden abrir hilos; docentes responden a los existentes
    if (senderIsTeacher) {
      throw new Error('Los docentes no pueden abrir nuevos hilos. Responde a una consulta existente.');
    }

    // Validar matrícula
    await assertEnrolled(courseId, senderId);

    const newThreadId = uuidv4();
    const thread = new CourseThread({
      _id:       newThreadId,
      courseId,
      studentId: senderId,
      teacherId: course.profesorId || course.docente?.user_id,
      subject:   text.trim().substring(0, 80),
      status:    'open',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await thread.save();

    // Primer mensaje del hilo
    const messageId = uuidv4();
    const msg = new CourseMessage({
      _id:           messageId,
      threadId:      newThreadId,
      courseId,
      senderId,
      sender_nombre: sender.fullName,
      isTeacher:     false,
      contenido:     text.trim(),
      leido:         false,
      sentAt:        new Date(),
    });
    await msg.save();

    return {
      threadId:  newThreadId,
      messageId,
      isNewThread: true,
      message:   'Consulta enviada correctamente.',
    };
  }

  // ── Caso 2: respuesta en hilo existente ──────────────────────────────────
  const thread = await CourseThread.findById(threadId).lean();
  if (!thread || thread.courseId !== courseId) {
    throw new Error('Hilo no encontrado o no pertenece a este curso.');
  }

  if (thread.status === 'closed') {
    throw new Error('Este hilo está cerrado y no acepta más mensajes.');
  }

  // Verificar acceso
  if (!senderIsTeacher) {
    // Es estudiante: validar que sea el dueño del hilo y esté matriculado
    if (thread.studentId !== senderId) {
      throw new Error('No tienes acceso a este hilo.');
    }
    await assertEnrolled(courseId, senderId);
  }

  const messageId = uuidv4();
  const msg = new CourseMessage({
    _id:           messageId,
    threadId,
    courseId,
    senderId,
    sender_nombre: sender.fullName,
    isTeacher:     senderIsTeacher,
    contenido:     text.trim(),
    leido:         false,
    sentAt:        new Date(),
  });
  await msg.save();

  // Actualizar estado del hilo
  const newStatus = senderIsTeacher ? 'answered' : 'open';
  await CourseThread.findByIdAndUpdate(threadId, {
    status:    newStatus,
    updatedAt: new Date(),
  });

  return {
    threadId,
    messageId,
    isNewThread: false,
    message: senderIsTeacher
      ? 'Respuesta enviada correctamente.'
      : 'Mensaje enviado correctamente.',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-17 — Listar hilos de consulta de un curso
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve los hilos de consulta de un curso.
 *
 * - Docente: ve todos los hilos del curso.
 * - Estudiante: ve solo sus propios hilos.
 *
 * @param {object} params
 * @param {string} params.courseId
 * @param {string} params.userId
 * @returns {Promise<{ threads }>}
 */
const getCourseThreads = async ({ courseId, userId }) => {
  const course = await getCourse(courseId);
  const user   = await getUser(userId);

  const senderIsTeacher = isTeacher(course, userId);

  let filter = { courseId };
  if (!senderIsTeacher) {
    // Estudiante: validar matrícula y filtrar sus hilos
    await assertEnrolled(courseId, userId);
    filter.studentId = userId;
  }

  const threads = await CourseThread.find(filter)
    .sort({ updatedAt: -1 })
    .lean();

  // Enriquecer con el último mensaje de cada hilo
  const enriched = await Promise.all(
    threads.map(async (t) => {
      const lastMsg = await CourseMessage.findOne({ threadId: t._id })
        .sort({ sentAt: -1 })
        .lean();

      // Conteo de mensajes no leídos para el usuario
      const unreadFilter = {
        threadId:  t._id,
        senderId:  { $ne: userId },
        leido:     false,
      };
      const unreadCount = await CourseMessage.countDocuments(unreadFilter);

      // Datos del estudiante para la vista docente
      let studentInfo = null;
      if (senderIsTeacher && t.studentId) {
        const student = await User.findById(t.studentId)
          .select('username fullName avatar')
          .lean();
        studentInfo = student;
      }

      return {
        ...t,
        lastMessage:  lastMsg
          ? { contenido: lastMsg.contenido, sentAt: lastMsg.sentAt, isTeacher: lastMsg.isTeacher }
          : null,
        unreadCount,
        student: studentInfo,
      };
    })
  );

  return { threads: enriched };
};

// ─────────────────────────────────────────────────────────────────────────────
// Ver mensajes dentro de un hilo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve todos los mensajes de un hilo, ordenados cronológicamente.
 * Marca como leídos los mensajes que el usuario no ha visto.
 *
 * @param {object} params
 * @param {string} params.threadId
 * @param {string} params.userId
 * @returns {Promise<{ thread, messages }>}
 */
const getThreadMessages = async ({ threadId, userId }) => {
  const thread = await CourseThread.findById(threadId).lean();
  const { course, isDocente } = await assertThreadAccess(thread, userId);

  // Si es estudiante, validar matrícula
  if (!isDocente) {
    await assertEnrolled(thread.courseId, userId);
  }

  const messages = await CourseMessage.find({ threadId })
    .sort({ sentAt: 1 })
    .lean();

  // Marcar como leídos los mensajes del otro lado
  await CourseMessage.updateMany(
    { threadId, senderId: { $ne: userId }, leido: false },
    { $set: { leido: true } }
  );

  return { thread, messages };
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades adicionales
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cierra un hilo (solo el docente puede hacerlo).
 *
 * @param {object} params
 * @param {string} params.threadId
 * @param {string} params.teacherId
 */
const closeThread = async ({ threadId, teacherId }) => {
  const thread = await CourseThread.findById(threadId).lean();
  if (!thread) throw new Error('Hilo no encontrado.');

  const course = await getCourse(thread.courseId);
  if (!isTeacher(course, teacherId)) {
    throw new Error('Solo el docente puede cerrar hilos.');
  }

  await CourseThread.findByIdAndUpdate(threadId, {
    status:    'closed',
    updatedAt: new Date(),
  });

  return { message: 'Hilo cerrado correctamente.' };
};

/**
 * Devuelve estadísticas de mensajería de un curso (vista docente).
 *
 * @param {string} courseId
 * @param {string} teacherId
 */
const getCourseMessageStats = async (courseId, teacherId) => {
  const course = await getCourse(courseId);
  if (!isTeacher(course, teacherId)) {
    throw new Error('Solo el docente puede ver estadísticas del curso.');
  }

  const stats = await CourseThread.aggregate([
    { $match: { courseId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const result = { open: 0, answered: 0, closed: 0, total: 0 };
  stats.forEach((s) => {
    result[s._id] = s.count;
    result.total += s.count;
  });

  const unreadMessages = await CourseMessage.countDocuments({
    courseId,
    isTeacher: false,
    leido:     false,
  });

  return { ...result, unreadMessages };
};

// Re-exportar mensajes directos desde Social.js para el controlador
const {
  sendDirectMessage,
  getDirectMessages,
  getConversations,
} = require('./Social');

module.exports = {
  // HU-26 / HU-17
  sendCourseQuery,
  getCourseThreads,
  getThreadMessages,
  // Utilidades
  closeThread,
  getCourseMessageStats,
  // HU-30 (re-exportados desde Social.js)
  sendDirectMessage,
  getDirectMessages,
  getConversations,
};
