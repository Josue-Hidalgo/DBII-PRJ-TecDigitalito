/**
 * Evaluations.js — Lógica de negocio para evaluaciones (HU-14, HU-24, HU-25).
 *
 * HU-14: Docente crea evaluaciones con preguntas de selección única.
 * HU-24: Estudiante realiza una evaluación y obtiene resultado inmediato.
 * HU-25: Estudiante ve todos sus resultados en un curso.
 */

const { v4: uuidv4 } = require('uuid');
const Evaluation  = require('../models/Evaluation.model');
const EvalAttempt = require('../models/Evalattempt.model');
const Enrollment  = require('../models/Enrollment.model');
const Course      = require('../models/Course.model');
const User        = require('../models/User.model');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica que el usuario sea docente del curso indicado.
 * Lanza error si no lo es.
 */
const assertTeacher = async (courseId, teacherId) => {
  const course = await Course.findById(courseId).lean();
  if (!course) throw new Error('Curso no encontrado.');
  if (course.docente.user_id !== teacherId && course.docente?.user_id !== teacherId) {
    throw new Error('No tienes permiso para realizar esta acción en el curso.');
  }
  return course;
};

/**
 * Verifica que el usuario esté matriculado activamente en el curso.
 * Lanza error si no lo está.
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
 * Valida la estructura de las preguntas que envía el docente.
 * Cada pregunta debe tener: text, opciones (mínimo 2) y correctOptionId válido.
 */
const validateQuestions = (questions) => {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('Debes incluir al menos una pregunta.');
  }

  questions.forEach((q, idx) => {
    if (!q.text || typeof q.text !== 'string' || !q.text.trim()) {
      throw new Error(`Pregunta ${idx + 1}: el texto es obligatorio.`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`Pregunta ${idx + 1}: debe tener al menos 2 opciones.`);
    }
    q.options.forEach((opt, oIdx) => {
      if (!opt.text || typeof opt.text !== 'string' || !opt.text.trim()) {
        throw new Error(`Pregunta ${idx + 1}, opción ${oIdx + 1}: el texto es obligatorio.`);
      }
    });
    const optionIds = q.options.map((o) => o.optionId);
    if (!q.correctOptionId || !optionIds.includes(q.correctOptionId)) {
      throw new Error(`Pregunta ${idx + 1}: correctOptionId debe corresponder a una de las opciones.`);
    }
  });
};

/**
 * Calcula el resultado de un intento.
 *
 * @param {Array} questions    - Preguntas de la evaluación (desde MongoDB)
 * @param {Array} answers      - Respuestas del estudiante: [{ questionId, selectedOptionId }]
 * @returns {{ correctas, total, calificacion, respuestas }}
 */
const calculateScore = (questions, answers) => {
  const answerMap = {};
  answers.forEach((a) => {
    answerMap[a.questionId] = a.selectedOptionId;
  });

  let correctas = 0;
  const respuestas = questions.map((q) => {
    const selectedOptionId = answerMap[q.questionId] || null;
    const isCorrect = selectedOptionId === q.correctOptionId;
    if (isCorrect) correctas++;

    return {
      questionId:      q.questionId,
      questionText:    q.text,
      selectedOptionId,
      correctOptionId: q.correctOptionId,
      isCorrect,
    };
  });

  const total = questions.length;
  const calificacion = total > 0 ? Math.round((correctas / total) * 100) : 0;

  return { correctas, total, calificacion, respuestas };
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-14 — Crear evaluación (docente)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una evaluación con preguntas de selección única.
 *
 * @param {object} params
 * @param {string} params.courseId
 * @param {string} params.teacherId
 * @param {string} params.title
 * @param {string} [params.descripcion]
 * @param {string|Date} params.startDate
 * @param {string|Date} params.endDate
 * @param {Array}  params.questions   - Ver validateQuestions() para estructura
 * @returns {Promise<{ evalId, title, message }>}
 */
const createEvaluation = async ({
  courseId, teacherId, title, descripcion, startDate, endDate, questions,
}) => {
  // Validar docencia
  await assertTeacher(courseId, teacherId);

  // Validar fechas
  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (isNaN(start.getTime())) throw new Error('startDate no es una fecha válida.');
  if (isNaN(end.getTime()))   throw new Error('endDate no es una fecha válida.');
  if (start >= end)           throw new Error('startDate debe ser anterior a endDate.');

  // Validar preguntas
  validateQuestions(questions);

  // Construir sub-documentos de preguntas con IDs si no vienen provistos
  const preguntasDoc = questions.map((q, idx) => ({
    questionId:      q.questionId || uuidv4(),
    text:            q.text.trim(),
    orden:           q.orden ?? idx,
    options:         q.options.map((o) => ({
      optionId: o.optionId || uuidv4(),
      text:     o.text.trim(),
    })),
    correctOptionId: q.correctOptionId,
  }));

  const evalId = uuidv4();
  const evaluation = new Evaluation({
    _id:                     evalId,
    courseId,
    teacherId,
    title:                   title.trim(),
    descripcion:             descripcion || null,
    startDate:               start,
    endDate:                 end,
    visible_para_estudiante: true,
    preguntas:               preguntasDoc,
  });

  await evaluation.save();

  // Audit (no bloqueante)
  try {
    const { auditChange } = require('./Audit');
    await auditChange({
      tableName:  'evaluations',
      recordId:   evalId,
      operation:  'CREATE',
      userId:     teacherId,
      newValues:  { courseId, title, startDate: start.toISOString(), endDate: end.toISOString() },
    });
  } catch (_) {}

  return {
    evalId,
    title:   evaluation.title,
    message: 'Evaluación creada correctamente.',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-24 — Realizar evaluación (estudiante)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra el intento de un estudiante y devuelve el resultado inmediato.
 *
 * @param {object} params
 * @param {string} params.studentId
 * @param {string} params.evalId
 * @param {Array}  params.answers   - [{ questionId, selectedOptionId }]
 * @returns {Promise<{ attemptId, calificacion, correctas, total, respuestas, message }>}
 */
const submitEvaluation = async ({ studentId, evalId, answers }) => {
  // Obtener evaluación
  const evaluation = await Evaluation.findById(evalId).lean();
  if (!evaluation) throw new Error('Evaluación no encontrada.');

  // Validar matrícula
  await assertEnrolled(evaluation.courseId, studentId);

  // Verificar ventana de tiempo
  const now = new Date();
  if (now < evaluation.startDate) {
    throw new Error('La evaluación no ha comenzado todavía.');
  }
  if (now > evaluation.endDate) {
    throw new Error('El período de la evaluación ya cerró.');
  }

  // Verificar intento único
  const existing = await EvalAttempt.findOne({ studentId, evalId }).lean();
  if (existing) {
    throw new Error('Ya realizaste esta evaluación. Solo se permite un intento.');
  }

  // Validar estructura de respuestas
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error('Debes enviar al menos una respuesta.');
  }

  // Calcular puntaje
  const { correctas, total, calificacion, respuestas } = calculateScore(
    evaluation.preguntas,
    answers
  );

  // Guardar intento
  const attemptId = uuidv4();
  const attempt = new EvalAttempt({
    _id:             attemptId,
    studentId,
    evalId,
    courseId:        evaluation.courseId,
    respuestas,
    correctas,
    total_preguntas: total,
    calificacion,
    submittedAt:     now,
  });

  await attempt.save();

  // Audit (no bloqueante)
  try {
    const { auditChange } = require('./Audit');
    await auditChange({
      tableName: 'eval_attempts',
      recordId:  attemptId,
      operation: 'CREATE',
      userId:    studentId,
      newValues: { evalId, calificacion: String(calificacion), correctas: String(correctas), total: String(total) },
    });
  } catch (_) {}

  return {
    attemptId,
    calificacion,
    correctas,
    total,
    respuestas,
    aprobado: calificacion >= 60,
    message:  `Evaluación completada. Obtuviste ${calificacion}% (${correctas}/${total} correctas).`,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-25 — Ver resultados del estudiante en un curso
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve todos los intentos del estudiante en un curso, con detalle.
 *
 * @param {object} params
 * @param {string} params.studentId
 * @param {string} params.courseId
 * @returns {Promise<{ attempts, stats }>}
 */
const getStudentEvalResults = async ({ studentId, courseId }) => {
  // Validar matrícula
  await assertEnrolled(courseId, studentId);

  // Obtener intentos del estudiante en el curso
  const attempts = await EvalAttempt.find({ studentId, courseId })
    .sort({ submittedAt: -1 })
    .lean();

  // Enriquecer con el título de la evaluación
  const enriched = await Promise.all(
    attempts.map(async (a) => {
      const evaluation = await Evaluation.findById(a.evalId)
        .select('title startDate endDate')
        .lean();
      return {
        ...a,
        evaluationTitle: evaluation?.title || 'Evaluación eliminada',
        evaluationStart: evaluation?.startDate || null,
        evaluationEnd:   evaluation?.endDate || null,
      };
    })
  );

  // Estadísticas agregadas
  const stats = {
    total:           enriched.length,
    promedio:        enriched.length
      ? Math.round(enriched.reduce((acc, a) => acc + a.calificacion, 0) / enriched.length)
      : 0,
    aprobadas:       enriched.filter((a) => a.calificacion >= 60).length,
    reprobadas:      enriched.filter((a) => a.calificacion < 60).length,
  };

  return { attempts: enriched, stats };
};

// ─────────────────────────────────────────────────────────────────────────────
// Vista docente — resultados de todos los estudiantes en una evaluación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve los resultados de todos los estudiantes para una evaluación.
 * Solo el docente del curso puede acceder.
 *
 * @param {object} params
 * @param {string} params.evalId
 * @param {string} params.teacherId
 * @returns {Promise<{ evaluation, attempts, stats }>}
 */
const getEvaluationResults = async ({ evalId, teacherId }) => {
  const evaluation = await Evaluation.findById(evalId).lean();
  if (!evaluation) throw new Error('Evaluación no encontrada.');

  // Validar docencia
  await assertTeacher(evaluation.courseId, teacherId);

  // Obtener todos los intentos
  const attempts = await EvalAttempt.find({ evalId })
    .sort({ submittedAt: -1 })
    .lean();

  // Enriquecer con datos del estudiante
  const enriched = await Promise.all(
    attempts.map(async (a) => {
      const student = await User.findById(a.studentId)
        .select('username fullName avatar')
        .lean();
      return {
        ...a,
        student: student
          ? { username: student.username, fullName: student.fullName, avatar: student.avatar }
          : { username: 'desconocido', fullName: 'Estudiante eliminado', avatar: '' },
      };
    })
  );

  // Estadísticas globales
  const total = enriched.length;
  const stats = {
    totalAttempts: total,
    promedio:      total
      ? Math.round(enriched.reduce((acc, a) => acc + a.calificacion, 0) / total)
      : 0,
    aprobados:     enriched.filter((a) => a.calificacion >= 60).length,
    reprobados:    enriched.filter((a) => a.calificacion < 60).length,
    maxNota:       total ? Math.max(...enriched.map((a) => a.calificacion)) : 0,
    minNota:       total ? Math.min(...enriched.map((a) => a.calificacion)) : 0,
  };

  return {
    evaluation: {
      evalId:    evaluation._id,
      title:     evaluation.title,
      startDate: evaluation.startDate,
      endDate:   evaluation.endDate,
      total_preguntas: evaluation.preguntas?.length || 0,
    },
    attempts: enriched,
    stats,
  };
};

module.exports = {
  createEvaluation,
  submitEvaluation,
  getStudentEvalResults,
  getEvaluationResults,
};
