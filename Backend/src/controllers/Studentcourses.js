// HU-20: Buscar cursos  |  HU-21: Matricularse  |  HU-22: Mis cursos
// HU-23: Ver secciones y contenido  |  HU-27: Ver otros estudiantes del curso
const { getMongoDB } = require("../config/mongodb");
const { getCassandraClient } = require("../config/cassandra");
const { getRedisClient } = require("../config/redis");
const crypto = require("crypto");

// ──────────────────────────────────────────────────────────────────────────────
// HU-20: Buscar cursos publicados
// ──────────────────────────────────────────────────────────────────────────────

/**
 * - MongoDB: búsqueda full-text sobre cursos publicados
 * - Redis: cache de resultados por query (TTL corto)
 */
async function searchPublishedCourses({ query = "", page = 1, pageSize = 20 }) {
  const redis = getRedisClient();
  const mongo = await getMongoDB();

  const cacheKey = `courses:search:${query}:${page}:${pageSize}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const filter = {
    isPublished: true,
    isActive: true,
    ...(query
      ? {
          $or: [
            { name: { $regex: query, $options: "i" } },
            { description: { $regex: query, $options: "i" } },
            { code: { $regex: query, $options: "i" } },
          ],
        }
      : {}),
  };

  const total = await mongo.collection("courses").countDocuments(filter);
  const courses = await mongo
    .collection("courses")
    .find(filter)
    .project({ sections: 0 }) // no traer el árbol en el listado
    .sort({ enrolledCount: -1, createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray();

  // Enriquecer con nombre del docente
  const teacherIds = [...new Set(courses.map((c) => c.teacherId))];
  const teachers = await mongo
    .collection("users")
    .find({ _id: { $in: teacherIds } }, { projection: { fullName: 1, username: 1 } })
    .toArray();
  const teacherMap = Object.fromEntries(teachers.map((t) => [t._id, t]));

  const result = {
    total,
    page,
    pageSize,
    courses: courses.map((c) => ({
      courseId: c._id,
      code: c.code,
      name: c.name,
      description: c.description,
      photo: c.photo,
      enrolledCount: c.enrolledCount,
      startDate: c.startDate,
      endDate: c.endDate,
      teacher: teacherMap[c.teacherId]
        ? { fullName: teacherMap[c.teacherId].fullName, username: teacherMap[c.teacherId].username }
        : null,
    })),
  };

  // Cache por 2 minutos
  await redis.set(cacheKey, JSON.stringify(result), { EX: 120 });
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-21: Matricularse a un curso
// ──────────────────────────────────────────────────────────────────────────────

async function enrollInCourse({ studentId, courseId }) {
  const mongo = await getMongoDB();
  const cassandra = getCassandraClient();
  const redis = getRedisClient();

  const course = await mongo.collection("courses").findOne({ _id: courseId, isPublished: true, isActive: true });
  if (!course) throw new Error("Curso no encontrado o no disponible.");

  if (course.teacherId === studentId) throw new Error("El docente no puede matricularse en su propio curso.");

  const alreadyEnrolled = await mongo.collection("enrollments").findOne({ studentId, courseId });
  if (alreadyEnrolled) throw new Error("Ya estás matriculado en este curso.");

  const enrollmentId = crypto.randomUUID();
  const now = new Date();

  // ─── MongoDB: registro de matrícula ─────────────────────────────────────
  await mongo.collection("enrollments").insertOne({
    _id: enrollmentId,
    studentId,
    courseId,
    enrolledAt: now,
    progress: 0,
  });

  // Incrementar contador en el curso
  await mongo.collection("courses").updateOne(
    { _id: courseId },
    { $inc: { enrolledCount: 1 }, $set: { updatedAt: now } }
  );

  // ─── Redis: invalidar caches relacionadas ───────────────────────────────
  await redis.del(`student:${studentId}:courses`);
  await redis.del("courses:published:cache");

  // ─── Cassandra: auditoría ───────────────────────────────────────────────
  await cassandra.execute(
    `INSERT INTO audit_log (event_id, event_type, user_id, username, timestamp, details, ip_address)
     VALUES (uuid(), 'STUDENT_ENROLLED', ?, 'student', toTimestamp(now()), ?, '0.0.0.0')`,
    [studentId, JSON.stringify({ courseId, enrollmentId })],
    { prepare: true }
  );

  return { enrollmentId, courseId, enrolledAt: now };
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-22: Lista de cursos en los que el estudiante está matriculado
// ──────────────────────────────────────────────────────────────────────────────

async function getStudentCourses({ studentId }) {
  const redis = getRedisClient();
  const mongo = await getMongoDB();

  const cacheKey = `student:${studentId}:courses`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const enrollments = await mongo.collection("enrollments").find({ studentId }).toArray();
  const courseIds = enrollments.map((e) => e.courseId);

  const courses = await mongo
    .collection("courses")
    .find({ _id: { $in: courseIds } })
    .project({ sections: 0 })
    .toArray();

  const result = courses.map((c) => {
    const enrollment = enrollments.find((e) => e.courseId === c._id);
    return {
      courseId: c._id,
      code: c.code,
      name: c.name,
      photo: c.photo,
      enrolledAt: enrollment?.enrolledAt,
      progress: enrollment?.progress ?? 0,
      endDate: c.endDate,
    };
  });

  // Cache 5 minutos
  await redis.set(cacheKey, JSON.stringify(result), { EX: 300 });
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-23: Ver secciones y contenido de un curso
// ──────────────────────────────────────────────────────────────────────────────

async function getCourseContent({ studentId, courseId }) {
  const mongo = await getMongoDB();

  // Verificar matrícula
  const enrollment = await mongo.collection("enrollments").findOne({ studentId, courseId });
  if (!enrollment) throw new Error("No estás matriculado en este curso.");

  const course = await mongo
    .collection("courses")
    .findOne({ _id: courseId }, { projection: { password: 0 } });
  if (!course) throw new Error("Curso no encontrado.");

  // Construir árbol de secciones a partir del array plano
  const sections = (course.sections || []).sort((a, b) => a.order - b.order);
  const sectionTree = buildTree(sections);

  return {
    courseId: course._id,
    name: course.name,
    description: course.description,
    sections: sectionTree,
  };
}

/** Construye un árbol a partir del array plano de secciones */
function buildTree(sections, parentId = null) {
  return sections
    .filter((s) => s.parentSectionId === parentId)
    .map((s) => ({
      sectionId: s.sectionId,
      title: s.title,
      order: s.order,
      content: s.content || [],
      children: buildTree(sections, s.sectionId),
    }));
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-27: Ver lista de otros estudiantes en el curso
// ──────────────────────────────────────────────────────────────────────────────

async function getCoursemates({ studentId, courseId }) {
  const mongo = await getMongoDB();

  const myEnrollment = await mongo.collection("enrollments").findOne({ studentId, courseId });
  if (!myEnrollment) throw new Error("No estás matriculado en este curso.");

  const enrollments = await mongo
    .collection("enrollments")
    .find({ courseId, studentId: { $ne: studentId } })
    .toArray();

  const studentIds = enrollments.map((e) => e.studentId);
  const students = await mongo
    .collection("users")
    .find({ _id: { $in: studentIds } }, { projection: { fullName: 1, username: 1, photo: 1 } })
    .toArray();

  return students.map((s) => ({
    userId: s._id,
    username: s.username,
    fullName: s.fullName,
    photo: s.photo,
  }));
}

module.exports = {
  searchPublishedCourses,
  enrollInCourse,
  getStudentCourses,
  getCourseContent,
  getCoursemates,
};