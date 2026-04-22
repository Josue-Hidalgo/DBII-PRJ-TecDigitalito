const express = require('express');
const router = express.Router();
const {
  searchCourses,
  enrollInCourse,
  getEnrolledCourses,
  getCourseContent,
} = require('../controllers/Enrollment.controller');

// HU-20 — Buscar cursos publicados (con ?q=término opcional)
router.get('/search', searchCourses);

// HU-21 — Matricularse en un curso
router.post('/', enrollInCourse);

// HU-22 — Ver lista de cursos en los que estoy matriculado
router.get('/student/:studentId', getEnrolledCourses);

// HU-23 — Ver secciones y contenido de un curso (estudiante matriculado)
router.get('/:courseId/content', getCourseContent);

module.exports = router;
