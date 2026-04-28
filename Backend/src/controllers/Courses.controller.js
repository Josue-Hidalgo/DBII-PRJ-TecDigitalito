const {
  createCourse,
  addSection,
  addContentToSection,
  publishCourse,
  getEnrolledStudents,
  getTeacherCourses,
  getSections,
  cloneCourse,
} = require('../logic/Coursemanagement');

// POST /api/courses  — HU-11
exports.createCourse = async (req, res) => {
  try {
    const { teacherId, code, name, description, startDate, endDate, photoBase64 } = req.body;
    if (!teacherId || !code || !name || !description || !startDate) {
      return res.status(400).json({ message: 'Faltan campos obligatorios.' });
    }
    const result = await createCourse({ teacherId, code, name, description, startDate, endDate, photoBase64 });
    res.status(201).json(result);
  } catch (error) {
    const status = error.message.includes('ya existe') ? 409 : 500;
    res.status(status).json({ message: error.message });
  }
};

// POST /api/courses/:courseId/sections  — HU-12
exports.addSection = async (req, res) => {
  try {
    const { courseId } = req.params;

    const teacherId = req.body.teacherId;
    const title = req.body.title || req.body.titulo;
    const descripcion = req.body.descripcion || req.body.description || '';
    const parentSectionId = req.body.parentSectionId || req.body.parent_section_id || null;
    const order = req.body.order ?? req.body.orden ?? 0;

    if (!teacherId || !title) {
      return res.status(400).json({ message: 'Faltan campos: teacherId y title son requeridos.' });
    }

    const result = await addSection({
      courseId,
      teacherId,
      title,
      descripcion,
      parentSectionId,
      order
    });

    res.status(201).json(result);
  } catch (error) {
    const status = error.message.includes('no encontrado') ? 404 : 500;
    res.status(status).json({ message: error.message });
  }
};

// POST /api/courses/:courseId/sections/:sectionId/content  — HU-13
exports.addContent = async (req, res) => {
  try {
    const { courseId, sectionId } = req.params;
    const { teacherId, contentType, payload } = req.body;
    if (!teacherId || !contentType || !payload) return res.status(400).json({ message: 'Faltan campos.' });

    const result = await addContentToSection({ courseId, teacherId, sectionId, contentType, payload });
    res.status(201).json(result);
  } catch (error) {
    const status = error.message.includes('inválido') || error.message.includes('no encontrada') ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
};

// PATCH /api/courses/:courseId/publish  — HU-15
exports.publishCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { teacherId } = req.body;
    if (!teacherId) return res.status(400).json({ message: 'teacherId requerido.' });

    const result = await publishCourse({ courseId, teacherId });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('no encontrado') ? 404 : 500;
    res.status(status).json({ message: error.message });
  }
};

// GET /api/courses/:courseId/students  — HU-16
exports.getEnrolledStudents = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { teacherId } = req.query;
    if (!teacherId) return res.status(400).json({ message: 'teacherId requerido.' });

    const result = await getEnrolledStudents({ courseId, teacherId });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('no encontrado') ? 404 : 500;
    res.status(status).json({ message: error.message });
  }
};

// GET /api/courses/teacher/:teacherId  — HU-18
exports.getTeacherCourses = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const result = await getTeacherCourses({ teacherId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSections = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { teacherId } = req.query;

    if (!courseId || !teacherId) {
      return res.status(400).json({ message: 'courseId y teacherId son requeridos.' });
    }

    const result = await getSections({ courseId, teacherId });

    res.status(200).json(result);
  } catch (error) {
    const status = error.message.includes('no encontrado') ? 404 : 500;
    res.status(status).json({ message: error.message });
  }
};

// POST /api/courses/:courseId/clone  — HU-19
exports.cloneCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { teacherId, newCode, newName, newStartDate, newEndDate } = req.body;
    if (!teacherId || !newCode || !newName || !newStartDate) {
      return res.status(400).json({ message: 'Faltan campos obligatorios para clonar.' });
    }

    const result = await cloneCourse({
      originalCourseId: courseId,
      teacherId,
      newCode,
      newName,
      newStartDate,
      newEndDate,
    });
    res.status(201).json(result);
  } catch (error) {
    const status = error.message.includes('no encontrado') ? 404 : error.message.includes('en uso') ? 409 : 500;
    res.status(status).json({ message: error.message });
  }
};