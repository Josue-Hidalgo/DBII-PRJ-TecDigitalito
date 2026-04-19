// HU-14: Crear evaluaciones (docente)
// HU-24: Realizar evaluación y ver resultado inmediato (estudiante)
// HU-25: Ver historial de resultados por curso (estudiante)
const { getMongoDB } = require("../config/mongodb");
const { getCassandraClient } = require("../config/cassandra");
const { getRedisClient } = require("../config/redis");
const crypto = require("crypto");

// ──────────────────────────────────────────────────────────────────────────────
// HU-14: Crear evaluación
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Una evaluación tiene:
 * - id, courseId, title, startDate, endDate
 * - preguntas: [{ questionId, text, options: [{optionId, text}], correctOptionId }]
 * La calificación se calcula automáticamente (todas las preguntas valen igual).
 *
 * - MongoDB: documento de evaluación con preguntas y respuestas correctas
 * - Cassandra: auditoría de creación
 */
async function createEvaluation({ courseId, teacherId, title, startDate, endDate, questions }) {
  const mongo = await getMongoDB();
  const cassandra = getCassandraClient();

  const course = await mongo.collection("courses").findOne({ _id: courseId, teacherId });
  if (!course) throw new Error("Curso no encontrado o no autorizado.");

  if (!questions || questions.length === 0) {
    throw new Error("La evaluación debe tener al menos una pregunta.");
  }

  // Validar que cada pregunta tenga respuesta correcta válida
  for (const q of questions) {
    const validOption = (q.options || []).some((o) => o.optionId === q.correctOptionId);
    if (!validOption) throw new Error(`La pregunta '${q.text}' no tiene respuesta correcta válida.`);
  }

  const evalId = crypto.randomUUID();
  const now = new Date();

  // Asignar IDs si no los tienen
  const processedQuestions = questions.map((q) => ({
    questionId: q.questionId || crypto.randomUUID(),
    text: q.text,
    options: q.options.map((o) => ({
      optionId: o.optionId || crypto.randomUUID(),
      text: o.text,
    })),
    correctOptionId: q.correctOptionId,
  }));

  const evalDoc = {
    _id: evalId,
    courseId,
    teacherId,
    title,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    questions: processedQuestions,
    createdAt: now,
    updatedAt: now,
  };

  await mongo.collection("evaluations").insertOne(evalDoc);

  await cassandra.execute(
    `INSERT INTO audit_log (event_id, event_type, user_id, username, timestamp, details, ip_address)
     VALUES (uuid(), 'EVALUATION_CREATED', ?, 'teacher', toTimestamp(now()), ?, '0.0.0.0')`,
    [teacherId, JSON.stringify({ evalId, courseId, title, questionCount: questions.length })],
    { prepare: true }
  );

  return { evalId, title, questionCount: processedQuestions.length };
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-24: Realizar evaluación y obtener resultado inmediato
// ──────────────────────────────────────────────────────────────────────────────

/**
 * answers: [{ questionId, selectedOptionId }]
 *
 * - MongoDB: leer la evaluación, guardar el intento y la calificación
 * - Redis: resultado inmediato en caché para el estudiante
 * - Cassandra: auditoría del intento
 */
async function submitEvaluation({ studentId, evalId, answers }) {
  const mongo = await getMongoDB();
  const redis = getRedisClient();
  const cassandra = getCassandraClient();

  // Verificar que no haya intentado antes
  const previous = await mongo.collection("evalAttempts").findOne({ studentId, evalId });
  if (previous) throw new Error("Ya realizaste esta evaluación.");

  const evaluation = await mongo.collection("evaluations").findOne({ _id: evalId });
  if (!evaluation) throw new Error("Evaluación no encontrada.");

  const now = new Date();
  if (now < new Date(evaluation.startDate)) throw new Error("La evaluación aún no ha comenzado.");
  if (now > new Date(evaluation.endDate)) throw new Error("La evaluación ya cerró.");

  // Verificar matrícula
  const enrollment = await mongo.collection("enrollments").findOne({ studentId, courseId: evaluation.courseId });
  if (!enrollment) throw new Error("No estás matriculado en este curso.");

  // ─── Calcular calificación ───────────────────────────────────────────────
  let correct = 0;
  const detailedAnswers = evaluation.questions.map((q) => {
    const studentAnswer = answers.find((a) => a.questionId === q.questionId);
    const isCorrect = studentAnswer?.selectedOptionId === q.correctOptionId;
    if (isCorrect) correct++;
    return {
      questionId: q.questionId,
      questionText: q.text,
      selectedOptionId: studentAnswer?.selectedOptionId ?? null,
      correctOptionId: q.correctOptionId,
      isCorrect,
    };
  });

  const total = evaluation.questions.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;

  // ─── MongoDB: guardar intento ─────────────────────────────────────────────
  const attemptId = crypto.randomUUID();
  const attemptDoc = {
    _id: attemptId,
    studentId,
    evalId,
    courseId: evaluation.courseId,
    answers: detailedAnswers,
    correct,
    total,
    score,
    submittedAt: now,
  };
  await mongo.collection("evalAttempts").insertOne(attemptDoc);

  // ─── Redis: cache del resultado para acceso inmediato (TTL: 1 hora) ──────
  await redis.set(
    `evalResult:${studentId}:${evalId}`,
    JSON.stringify({ score, correct, total, submittedAt: now }),
    { EX: 3600 }
  );

  // ─── Cassandra: auditoría ────────────────────────────────────────────────
  await cassandra.execute(
    `INSERT INTO audit_log (event_id, event_type, user_id, username, timestamp, details, ip_address)
     VALUES (uuid(), 'EVALUATION_SUBMITTED', ?, 'student', toTimestamp(now()), ?, '0.0.0.0')`,
    [studentId, JSON.stringify({ evalId, score, correct, total })],
    { prepare: true }
  );

  return { score, correct, total, detailedAnswers };
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-25: Ver resultados de todas las evaluaciones de un curso
// ──────────────────────────────────────────────────────────────────────────────

async function getStudentEvalResults({ studentId, courseId }) {
  const mongo = await getMongoDB();

  // Verificar matrícula
  const enrollment = await mongo.collection("enrollments").findOne({ studentId, courseId });
  if (!enrollment) throw new Error("No estás matriculado en este curso.");

  const attempts = await mongo
    .collection("evalAttempts")
    .find({ studentId, courseId })
    .sort({ submittedAt: -1 })
    .toArray();

  // Obtener títulos de las evaluaciones
  const evalIds = attempts.map((a) => a.evalId);
  const evaluations = await mongo
    .collection("evaluations")
    .find({ _id: { $in: evalIds } }, { projection: { title: 1 } })
    .toArray();
  const evalMap = Object.fromEntries(evaluations.map((e) => [e._id, e.title]));

  return attempts.map((a) => ({
    attemptId: a._id,
    evalId: a.evalId,
    evalTitle: evalMap[a.evalId] ?? "Sin título",
    score: a.score,
    correct: a.correct,
    total: a.total,
    submittedAt: a.submittedAt,
  }));
}

/**
 * Utilidad para docentes: ver resultados de todos los estudiantes en una evaluación.
 */
async function getEvaluationResults({ evalId, teacherId }) {
  const mongo = await getMongoDB();

  const evaluation = await mongo.collection("evaluations").findOne({ _id: evalId, teacherId });
  if (!evaluation) throw new Error("Evaluación no encontrada o no autorizada.");

  const attempts = await mongo
    .collection("evalAttempts")
    .find({ evalId })
    .sort({ score: -1 })
    .toArray();

  const studentIds = attempts.map((a) => a.studentId);
  const students = await mongo
    .collection("users")
    .find({ _id: { $in: studentIds } }, { projection: { fullName: 1, username: 1 } })
    .toArray();
  const studentMap = Object.fromEntries(students.map((s) => [s._id, s]));

  return {
    evalId,
    title: evaluation.title,
    totalStudents: attempts.length,
    average: attempts.length
      ? Math.round(attempts.reduce((acc, a) => acc + a.score, 0) / attempts.length)
      : 0,
    results: attempts.map((a) => ({
      student: studentMap[a.studentId]
        ? { fullName: studentMap[a.studentId].fullName, username: studentMap[a.studentId].username }
        : null,
      score: a.score,
      submittedAt: a.submittedAt,
    })),
  };
}

module.exports = { createEvaluation, submitEvaluation, getStudentEvalResults, getEvaluationResults };