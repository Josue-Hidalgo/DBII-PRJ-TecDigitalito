const express = require('express');
const router = express.Router();
const {
  createEvaluation,
  submitEvaluation,
  getTeacherEvaluations,
  getStudentEvaluations,
  getEvaluationForStudent,
  getStudentResults,
  getEvaluationResults,
} = require('../controllers/Evaluations.controllers');

// HU-14 — Crear una evaluación en un curso (docente)
router.post('/', createEvaluation);

// HU-24 — Realizar una evaluación (estudiante) y obtener resultado inmediato
router.post('/:evalId/submit', submitEvaluation);

// HU-25 — Ver resultados de todas las evaluaciones del estudiante en un curso
router.get('/student/:studentId/course/:courseId', getStudentResults);


router.get('/course/:courseId/teacher', getTeacherEvaluations);

router.get('/course/:courseId/student', getStudentEvaluations);

router.get('/:evalId/take', getEvaluationForStudent);

// Vista docente — Ver resultados de todos los estudiantes en una evaluación
router.get('/:evalId/results', getEvaluationResults);

module.exports = router;
