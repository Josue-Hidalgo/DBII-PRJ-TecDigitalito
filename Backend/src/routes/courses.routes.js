const express = require('express');
const router = express.Router();
const {
  createCourse,
  addSection,
  addContent,
  publishCourse,
  getEnrolledStudents,
  getTeacherCourses,
  cloneCourse,
} = require('../controllers/Courses.controller');

// ── Docente ──────────────────────────────────────────────────────────────────

// HU-11 — Crear un curso
router.post('/', createCourse);

// HU-12 — Agregar sección (o sub-sección) a un curso
router.post('/:courseId/sections', addSection);

// HU-13 — Agregar contenido a una sección (texto, documento, video, imagen)
router.post('/:courseId/sections/:sectionId/content', addContent);

// HU-15 — Publicar un curso
router.patch('/:courseId/publish', publishCourse);

// HU-16 — Ver lista de estudiantes matriculados en un curso
router.get('/:courseId/students', getEnrolledStudents);

// HU-18 — Ver todos los cursos que imparte el docente
router.get('/teacher/:teacherId', getTeacherCourses);

// HU-19 — Clonar un curso
router.post('/:courseId/clone', cloneCourse);

module.exports = router;
