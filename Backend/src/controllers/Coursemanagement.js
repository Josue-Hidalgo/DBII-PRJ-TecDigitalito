// HU-11 al HU-19: Gestión de Cursos (docente)
const { getMongoDB } = require("../config/mongodb");
const { getCassandraClient } = require("../config/cassandra");
const { getRedisClient } = require("../config/redis");
const crypto = require("crypto");

// ──────────────────────────────────────────────────────────────────────────────
// HU-11: Crear curso
// ──────────────────────────────────────────────────────────────────────────────

/**
 * - MongoDB: documento principal del curso
 * - Cassandra: auditoría de creación
 */
async function createCourse({ teacherId, code, name, description, startDate, endDate = null, photoBase64 = null }) {
  const mongo = await getMongoDB();
  const cassandra = getCassandraClient();

  const existing = await mongo.collection("courses").findOne({ code });
  if (existing) throw new Error(`El código de curso '${code}' ya existe.`);

  const courseId = crypto.randomUUID();
  const now = new Date();

  const courseDoc = {
    _id: courseId,
    code,
    name,
    description,
    teacherId,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    photo: photoBase64 || null,
    isPublished: false,   // HU-15: visible solo al publicar
    isActive: true,
    sections: [],          // árbol de secciones (HU-12)
    enrolledCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await mongo.collection("courses").insertOne(courseDoc);

  await cassandra.execute(
    `INSERT INTO audit_log (event_id, event_type, user_id, username, timestamp, details, ip_address)
     VALUES (uuid(), 'COURSE_CREATED', ?, 'teacher', toTimestamp(now()), ?, '0.0.0.0')`,
    [teacherId, JSON.stringify({ courseId, code, name })],
    { prepare: true }
  );

  return { courseId, code, name };
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-12: Agregar secciones (árbol ilimitado de temas/subtemas)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Una sección tiene: id, title, order, parentSectionId (null = raíz), content[]
 * Se guarda dentro del documento del curso en MongoDB (árbol embebido).
 */
async function addSection({ courseId, teacherId, title, parentSectionId = null, order = 0 }) {
  const mongo = await getMongoDB();

  const course = await mongo.collection("courses").findOne({ _id: courseId, teacherId });
  if (!course) throw new Error("Curso no encontrado o no autorizado.");

  const sectionId = crypto.randomUUID();
  const newSection = {
    sectionId,
    title,
    parentSectionId,
    order,
    content: [],       // HU-13: contenido multimedia
    createdAt: new Date(),
  };

  await mongo.collection("courses").updateOne(
    { _id: courseId },
    { $push: { sections: newSection }, $set: { updatedAt: new Date() } }
  );

  return { sectionId, title, parentSectionId };
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-13: Agregar contenido a una sección (texto, docs, videos, imágenes)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * contentType: 'text' | 'document' | 'video' | 'image'
 * payload: { text } | { url, filename } | { url, title } | { url, alt }
 */
async function addContentToSection({ courseId, teacherId, sectionId, contentType, payload }) {
  const mongo = await getMongoDB();

  const VALID_TYPES = ["text", "document", "video", "image"];
  if (!VALID_TYPES.includes(contentType)) {
    throw new Error(`Tipo de contenido inválido: ${contentType}`);
  }

  const contentItem = {
    contentId: crypto.randomUUID(),
    type: contentType,
    payload,
    createdAt: new Date(),
  };

  // Actualizar el array de contenido de la sección específica
  const result = await mongo.collection("courses").updateOne(
    { _id: courseId, teacherId, "sections.sectionId": sectionId },
    {
      $push: { "sections.$.content": contentItem },
      $set: { updatedAt: new Date() },
    }
  );

  if (result.matchedCount === 0) throw new Error("Sección no encontrada.");
  return { contentId: contentItem.contentId, contentType };
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-15: Publicar curso
// ──────────────────────────────────────────────────────────────────────────────

async function publishCourse({ courseId, teacherId }) {
  const mongo = await getMongoDB();
  const cassandra = getCassandraClient();
  const redis = getRedisClient();

  const result = await mongo.collection("courses").updateOne(
    { _id: courseId, teacherId, isPublished: false },
    { $set: { isPublished: true, publishedAt: new Date(), updatedAt: new Date() } }
  );

  if (result.matchedCount === 0) throw new Error("Curso no encontrado, ya publicado, o no autorizado.");

  // ─── Redis: invalidar cache de búsqueda de cursos ───────────────────────
  await redis.del("courses:published:cache");

  await cassandra.execute(
    `INSERT INTO audit_log (event_id, event_type, user_id, username, timestamp, details, ip_address)
     VALUES (uuid(), 'COURSE_PUBLISHED', ?, 'teacher', toTimestamp(now()), ?, '0.0.0.0')`,
    [teacherId, JSON.stringify({ courseId })],
    { prepare: true }
  );

  return { success: true, message: "Curso publicado exitosamente." };
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-16: Ver lista de estudiantes matriculados
// ──────────────────────────────────────────────────────────────────────────────

async function getEnrolledStudents({ courseId, teacherId }) {
  const mongo = await getMongoDB();

  const course = await mongo.collection("courses").findOne({ _id: courseId, teacherId });
  if (!course) throw new Error("Curso no encontrado o no autorizado.");

  const enrollments = await mongo
    .collection("enrollments")
    .find({ courseId })
    .toArray();

  const studentIds = enrollments.map((e) => e.studentId);
  const students = await mongo
    .collection("users")
    .find({ _id: { $in: studentIds } }, { projection: { password: 0, salt: 0 } })
    .toArray();

  return students.map((s) => ({
    userId: s._id,
    username: s.username,
    fullName: s.fullName,
    enrolledAt: enrollments.find((e) => e.studentId === s._id)?.enrolledAt,
  }));
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-18: Lista de cursos del docente (activos y terminados)
// ──────────────────────────────────────────────────────────────────────────────

async function getTeacherCourses({ teacherId }) {
  const mongo = await getMongoDB();

  const courses = await mongo
    .collection("courses")
    .find({ teacherId })
    .project({ sections: 0 }) // no traer el árbol completo en el listado
    .sort({ createdAt: -1 })
    .toArray();

  const now = new Date();
  return courses.map((c) => ({
    courseId: c._id,
    code: c.code,
    name: c.name,
    isPublished: c.isPublished,
    enrolledCount: c.enrolledCount,
    status: !c.isPublished
      ? "draft"
      : c.endDate && new Date(c.endDate) < now
      ? "finished"
      : "active",
    startDate: c.startDate,
    endDate: c.endDate,
  }));
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-19: Clonar curso
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Copia todos los materiales (secciones y contenido) pero exige nuevos:
 * code, name, startDate. endDate es opcional.
 */
async function cloneCourse({ originalCourseId, teacherId, newCode, newName, newStartDate, newEndDate = null }) {
  const mongo = await getMongoDB();
  const cassandra = getCassandraClient();

  const original = await mongo.collection("courses").findOne({ _id: originalCourseId, teacherId });
  if (!original) throw new Error("Curso original no encontrado o no autorizado.");

  const existingCode = await mongo.collection("courses").findOne({ code: newCode });
  if (existingCode) throw new Error(`El código '${newCode}' ya está en uso.`);

  // Reasignar IDs a las secciones y su contenido para el clon
  const clonedSections = (original.sections || []).map((s) => ({
    ...s,
    sectionId: crypto.randomUUID(),
    content: (s.content || []).map((c) => ({ ...c, contentId: crypto.randomUUID() })),
    createdAt: new Date(),
  }));

  const newCourseId = crypto.randomUUID();
  const now = new Date();

  const cloneDoc = {
    _id: newCourseId,
    code: newCode,
    name: newName,
    description: original.description,
    teacherId,
    startDate: new Date(newStartDate),
    endDate: newEndDate ? new Date(newEndDate) : null,
    photo: original.photo,
    isPublished: false,
    isActive: true,
    sections: clonedSections,
    enrolledCount: 0,
    clonedFrom: originalCourseId,
    createdAt: now,
    updatedAt: now,
  };

  await mongo.collection("courses").insertOne(cloneDoc);

  await cassandra.execute(
    `INSERT INTO audit_log (event_id, event_type, user_id, username, timestamp, details, ip_address)
     VALUES (uuid(), 'COURSE_CLONED', ?, 'teacher', toTimestamp(now()), ?, '0.0.0.0')`,
    [teacherId, JSON.stringify({ originalCourseId, newCourseId, newCode })],
    { prepare: true }
  );

  return { newCourseId, newCode, newName, sectionsCloned: clonedSections.length };
}

module.exports = {
  createCourse,
  addSection,
  addContentToSection,
  publishCourse,
  getEnrolledStudents,
  getTeacherCourses,
  cloneCourse,
};