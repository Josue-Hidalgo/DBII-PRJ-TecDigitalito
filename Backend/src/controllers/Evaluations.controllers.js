const {
  createEvaluation,
  submitEvaluation,
  getStudentEvalResults,
  getEvaluationResults,
} = require('../logic/Evaluations');

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

exports.getTeacherEvaluations = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { teacherId } = req.query;

    if (!teacherId) {
      return res.status(400).json({ message: 'teacherId requerido.' });
    }

    const Evaluation = require('../models/Evaluation.model');
    const Course = require('../models/Course.model');

    const course = await Course.findById(courseId).lean();
    if (!course) return res.status(404).json({ message: 'Curso no encontrado.' });

    if (String(course.docente?.user_id) !== String(teacherId)) {
      return res.status(403).json({ message: 'No tienes permiso para ver estas evaluaciones.' });
    }

    const evaluations = await Evaluation.find({ courseId })
      .sort({ startDate: -1 })
      .lean();

    res.json({
      evaluations: evaluations.map(e => ({
        evalId: e._id,
        title: e.title,
        descripcion: e.descripcion,
        startDate: e.startDate,
        endDate: e.endDate,
        total_preguntas: e.preguntas?.length || 0,
        visible_para_estudiante: e.visible_para_estudiante
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getStudentEvaluations = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { studentId } = req.query;

    if (!studentId) {
      return res.status(400).json({ message: 'studentId requerido.' });
    }

    const Evaluation = require('../models/Evaluation.model');
    const EvalAttempt = require('../models/Evalattempt.model');
    const Enrollment = require('../models/Enrollment.model');

    const enrollment = await Enrollment.findOne({
      courseId,
      studentId,
      estado: 'activo'
    }).lean();

    if (!enrollment) {
      return res.status(403).json({ message: 'No estás matriculado en este curso.' });
    }

    const evaluations = await Evaluation.find({
      courseId,
      visible_para_estudiante: true
    }).sort({ startDate: -1 }).lean();

    const attempts = await EvalAttempt.find({ courseId, studentId }).lean();
    const attemptsByEval = {};

    attempts.forEach(a => {
      attemptsByEval[a.evalId] = a;
    });

    const now = new Date();

    res.json({
      evaluations: evaluations.map(e => {
        const attempt = attemptsByEval[e._id];

        return {
          evalId: e._id,
          title: e.title,
          descripcion: e.descripcion,
          startDate: e.startDate,
          endDate: e.endDate,
          total_preguntas: e.preguntas?.length || 0,
          ya_realizada: !!attempt,
          disponible: !attempt && now >= new Date(e.startDate) && now <= new Date(e.endDate),
          calificacion: attempt?.calificacion ?? null,
          correctas: attempt?.correctas ?? null,
          submittedAt: attempt?.submittedAt ?? null
        };
      })
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEvaluationForStudent = async (req, res) => {
  try {
    const { evalId } = req.params;
    const { studentId } = req.query;

    if (!studentId) {
      return res.status(400).json({ message: 'studentId requerido.' });
    }

    const Evaluation = require('../models/Evaluation.model');
    const EvalAttempt = require('../models/Evalattempt.model');
    const Enrollment = require('../models/Enrollment.model');

    const evaluation = await Evaluation.findById(evalId).lean();
    if (!evaluation) {
      return res.status(404).json({ message: 'Evaluación no encontrada.' });
    }

    const enrollment = await Enrollment.findOne({
      courseId: evaluation.courseId,
      studentId,
      estado: 'activo'
    }).lean();

    if (!enrollment) {
      return res.status(403).json({ message: 'No estás matriculado en este curso.' });
    }

    const existing = await EvalAttempt.findOne({ evalId, studentId }).lean();
    if (existing) {
      return res.status(409).json({ message: 'Ya realizaste esta evaluación.' });
    }

    const now = new Date();
    if (now < new Date(evaluation.startDate)) {
      return res.status(400).json({ message: 'La evaluación no ha comenzado todavía.' });
    }

    if (now > new Date(evaluation.endDate)) {
      return res.status(400).json({ message: 'El período de la evaluación ya cerró.' });
    }

    res.json({
      evaluation: {
        evalId: evaluation._id,
        title: evaluation.title,
        descripcion: evaluation.descripcion,
        startDate: evaluation.startDate,
        endDate: evaluation.endDate,
        preguntas: evaluation.preguntas.map(q => ({
          questionId: q.questionId,
          text: q.text,
          options: q.options.map(o => ({
            optionId: o.optionId,
            text: o.text
          }))
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};