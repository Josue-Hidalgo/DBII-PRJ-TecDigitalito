const {
  createEvaluation,
  submitEvaluation,
  getStudentEvalResults,
  getEvaluationResults,
} = require('../../logic/Evaluations');

// POST /api/evaluations  — HU-14
exports.createEvaluation = async (req, res) => {
  try {
    const { courseId, teacherId, title, startDate, endDate, questions } = req.body;
    if (!courseId || !teacherId || !title || !startDate || !endDate || !questions) {
      return res.status(400).json({ message: 'Faltan campos obligatorios.' });
    }

    const result = await createEvaluation({ courseId, teacherId, title, startDate, endDate, questions });
    res.status(201).json(result);
  } catch (error) {
    const status = error.message.includes('no encontrado') ? 404 : 400;
    res.status(status).json({ message: error.message });
  }
};

// POST /api/evaluations/:evalId/submit  — HU-24
exports.submitEvaluation = async (req, res) => {
  try {
    const { evalId } = req.params;
    const { studentId, answers } = req.body;
    if (!studentId || !answers) return res.status(400).json({ message: 'Faltan campos.' });

    const result = await submitEvaluation({ studentId, evalId, answers });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('Ya realizaste') ? 409
      : error.message.includes('no encontr') ? 404
      : error.message.includes('no ha comenzado') || error.message.includes('cerró') ? 400
      : 500;
    res.status(status).json({ message: error.message });
  }
};

// GET /api/evaluations/student/:studentId/course/:courseId  — HU-25
exports.getStudentResults = async (req, res) => {
  try {
    const { studentId, courseId } = req.params;
    const result = await getStudentEvalResults({ studentId, courseId });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('matriculado') ? 403 : 500;
    res.status(status).json({ message: error.message });
  }
};

// GET /api/evaluations/:evalId/results  — vista docente
exports.getEvaluationResults = async (req, res) => {
  try {
    const { evalId } = req.params;
    const { teacherId } = req.query;
    if (!teacherId) return res.status(400).json({ message: 'teacherId requerido.' });

    const result = await getEvaluationResults({ evalId, teacherId });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('no encontr') ? 404 : 500;
    res.status(status).json({ message: error.message });
  }
};