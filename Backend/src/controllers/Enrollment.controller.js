/**
 * Enrollment.controller.js
 * Controlador para funcionalidades de matrícula de estudiantes (HU 20-23).
 */

const {
    searchCourses,
    enrollInCourse,
    getEnrolledCourses,
    getCourseContent,
    getCoursemates,
} = require('../logic/Enrollment');

// GET /api/enrollment/search?q=término  (HU-20)
exports.searchCourses = async (req, res) => {
    try {
        const { q, limit } = req.query;
        const result = await searchCourses({ query: q, limit: parseInt(limit) || 20 });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /api/enrollment/enroll  (HU-21)
exports.enrollInCourse = async (req, res) => {
    try {
        const { studentId, courseId } = req.body;
        if (!studentId || !courseId) {
            return res.status(400).json({ message: 'studentId y courseId son requeridos.' });
        }

        const result = await enrollInCourse({ studentId, courseId });
        res.status(201).json(result);
    } catch (error) {
        const status = error.message.includes('matriculado') ? 409 : 
                       error.message.includes('no encontrado') ? 404 : 500;
        res.status(status).json({ message: error.message });
    }
};

// GET /api/enrollment/my-courses/:studentId  (HU-22)
exports.getEnrolledCourses = async (req, res) => {
    try {
        const { studentId } = req.params;
        if (!studentId) {
            return res.status(400).json({ message: 'studentId requerido.' });
        }

        const result = await getEnrolledCourses({ studentId });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/enrollment/course-content/:courseId?userId=xxx  (HU-23)
exports.getCourseContent = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { userId } = req.query;
        if (!courseId || !userId) {
            return res.status(400).json({ message: 'courseId y userId son requeridos.' });
        }

        const result = await getCourseContent({ userId, courseId });
        res.json(result);
    } catch (error) {
        const status = error.message.includes('matriculado') ? 403 : 500;
        res.status(status).json({ message: error.message });
    }
};

// GET /api/enrollment/coursemates/:courseId?userId=xxx  (HU-27)
exports.getCoursemates = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { userId } = req.query;
        if (!courseId || !userId) {
            return res.status(400).json({ message: 'courseId y userId son requeridos.' });
        }

        const result = await getCoursemates({ userId, courseId });
        res.json(result);
    } catch (error) {
        const status = error.message.includes('matriculado') ? 403 : 500;
        res.status(status).json({ message: error.message });
    }
};
