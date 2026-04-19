const { v4: uuidv4 } = require('uuid');
const Course = require('../models/Course.model');
const Section = require('../models/Section.model');
const Content = require('../models/Content.model');
const Enrollment = require('../models/Enrollment.model');
const User = require('../models/User.model');
const { syncCourseToGraph, syncPublishToGraph } = require('./Social');

// Helper para validar que un usuario exista
const validateUser = async (userId) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('Usuario no encontrado.');
    return user;
};

// Helper para validar que un curso exista
const validateCourse = async (courseId) => {
    const course = await Course.findById(courseId);
    if (!course) throw new Error('Curso no encontrado.');
    return course;
};

// HU-11: Crear un curso
const createCourse = async ({ teacherId, code, name, description, startDate, endDate, photoBase64 }) => {
    // Validar docente
    await validateUser(teacherId);

    // Verificar que el código no exista
    const existingCourse = await Course.findOne({ code: code.trim().toUpperCase() });
    if (existingCourse) throw new Error('El código de curso ya está en uso.');

    const courseId = uuidv4();
    const course = new Course({
        _id: courseId,
        codigo: code.trim().toUpperCase(),
        nombre: name.trim(),
        descripcion: description.trim(),
        fechaInicio: new Date(startDate),
        fechaFin: endDate ? new Date(endDate) : null,
        foto: photoBase64 || '',
        profesorId: teacherId,
        publicado: false,
        estado: 'borrador'
    });

    await course.save();

    // Sincronizar con Neo4j
    await syncCourseToGraph({ 
        courseId, 
        code: course.codigo, 
        name: course.nombre, 
        teacherId, 
        publicado: false, 
        estado: 'borrador' 
    });

    return {
        courseId,
        code: course.codigo,
        name: course.nombre,
        message: 'Curso creado correctamente.'
    };
};

// HU-12: Agregar sección a un curso
const addSection = async ({ courseId, teacherId, title, parentSectionId, order }) => {
    // Validar curso y docente
    const course = await validateCourse(courseId);
    if (course.profesorId !== teacherId) {
        throw new Error('Solo el docente del curso puede agregar secciones.');
    }

    const sectionId = uuidv4();
    const section = new Section({
        _id: sectionId,
        courseId,
        title: title.trim(),
        parentSectionId: parentSectionId || null,
        order: order || 0
    });

    await section.save();

    return {
        sectionId,
        title: section.title,
        message: 'Sección agregada correctamente.'
    };
};

// HU-13: Agregar contenido a una sección
const addContentToSection = async ({ courseId, teacherId, sectionId, contentType, payload }) => {
    // Validar curso y docente
    const course = await validateCourse(courseId);
    if (course.profesorId !== teacherId) {
        throw new Error('Solo el docente del curso puede agregar contenido.');
    }

    // Validar sección
    const section = await Section.findById(sectionId);
    if (!section || section.courseId !== courseId) {
        throw new Error('Sección no encontrada o no pertenece a este curso.');
    }

    // Validar tipo de contenido
    const validTypes = ['texto', 'documento', 'video', 'imagen'];
    if (!validTypes.includes(contentType)) {
        throw new Error('Tipo de contenido no válido.');
    }

    const contentId = uuidv4();
    const content = new Content({
        _id: contentId,
        sectionId,
        tipo: contentType,
        data: payload,
        order: 0
    });

    await content.save();

    return {
        contentId,
        type: contentType,
        message: 'Contenido agregado correctamente.'
    };
};

// HU-15: Publicar un curso
const publishCourse = async ({ courseId, teacherId }) => {
    // Validar curso y docente
    const course = await validateCourse(courseId);
    if (course.profesorId !== teacherId) {
        throw new Error('Solo el docente del curso puede publicarlo.');
    }

    if (course.publicado) {
        throw new Error('El curso ya está publicado.');
    }

    // Actualizar en MongoDB
    course.publicado = true;
    course.estado = 'activo';
    await course.save();

    // Sincronizar con Neo4j
    await syncPublishToGraph(courseId);

    return {
        courseId,
        message: 'Curso publicado correctamente.'
    };
};

// HU-16: Ver estudiantes matriculados
const getEnrolledStudents = async ({ courseId, teacherId }) => {
    // Validar curso y docente
    const course = await validateCourse(courseId);
    if (course.profesorId !== teacherId) {
        throw new Error('Solo el docente del curso puede ver los estudiantes.');
    }

    const enrollments = await Enrollment.find({ courseId, estado: 'activo' })
        .populate('studentId', 'username fullName avatar')
        .sort({ enrolledAt: 1 });

    const students = enrollments.map(e => ({
        studentId: e.studentId._id,
        username: e.studentId.username,
        fullName: e.studentId.fullName,
        avatar: e.studentId.avatar,
        enrolledAt: e.enrolledAt
    }));

    return { students };
};

// HU-18: Ver cursos del docente
const getTeacherCourses = async ({ teacherId }) => {
    await validateUser(teacherId);

    const courses = await Course.find({ profesorId: teacherId })
        .sort({ createdAt: -1 });

    return { courses };
};

// HU-19: Clonar un curso
const cloneCourse = async ({ originalCourseId, teacherId, newCode, newName, newStartDate, newEndDate }) => {
    // Validar curso original y docente
    const originalCourse = await validateCourse(originalCourseId);
    if (originalCourse.profesorId !== teacherId) {
        throw new Error('Solo el docente del curso puede clonarlo.');
    }

    // Validar que el nuevo código no exista
    const existingCourse = await Course.findOne({ codigo: newCode.trim().toUpperCase() });
    if (existingCourse) throw new Error('El código de curso ya está en uso.');

    // Crear nuevo curso
    const newCourseId = uuidv4();
    const newCourse = new Course({
        _id: newCourseId,
        codigo: newCode.trim().toUpperCase(),
        nombre: newName.trim(),
        descripcion: originalCourse.descripcion,
        fechaInicio: new Date(newStartDate),
        fechaFin: newEndDate ? new Date(newEndDate) : null,
        foto: originalCourse.foto,
        profesorId: teacherId,
        publicado: false,
        estado: 'borrador'
    });

    await newCourse.save();

    // Sincronizar con Neo4j
    await syncCourseToGraph({ 
        courseId: newCourseId, 
        code: newCourse.codigo, 
        name: newCourse.nombre, 
        teacherId, 
        publicado: false, 
        estado: 'borrador' 
    });

    // Clonar secciones y contenido
    const sections = await Section.find({ courseId: originalCourseId }).sort({ order: 1 });
    const sectionMap = new Map(); // oldId -> newId

    for (const section of sections) {
        const newSectionId = uuidv4();
        sectionMap.set(section._id.toString(), newSectionId);

        const newSection = new Section({
            _id: newSectionId,
            courseId: newCourseId,
            title: section.title,
            parentSectionId: section.parentSectionId ? sectionMap.get(section.parentSectionId.toString()) : null,
            order: section.order
        });

        await newSection.save();

        // Clonar contenido de la sección
        const contents = await Content.find({ sectionId: section._id });
        for (const content of contents) {
            const newContent = new Content({
                _id: uuidv4(),
                sectionId: newSectionId,
                tipo: content.tipo,
                data: content.data,
                order: content.order
            });
            await newContent.save();
        }
    }

    return {
        courseId: newCourseId,
        code: newCourse.codigo,
        name: newCourse.nombre,
        message: 'Curso clonado correctamente.'
    };
};

module.exports = {
    createCourse,
    addSection,
    addContentToSection,
    publishCourse,
    getEnrolledStudents,
    getTeacherCourses,
    cloneCourse
};
