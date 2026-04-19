const { v4: uuidv4 } = require('uuid');
const Course = require('../models/Course.model');
const Enrollment = require('../models/Enrollment.model');
const User = require('../models/User.model');
const Section = require('../models/Section.model');
const Content = require('../models/Content.model');
const { syncEnrollmentToGraph } = require('./Social');

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

// HU-20: Buscar cursos publicados
const searchCourses = async ({ query, limit = 20 }) => {
    let searchFilter = { publicado: true };
    
    if (query && query.trim()) {
        const searchTerm = query.trim();
        searchFilter.$or = [
            { nombre: { $regex: searchTerm, $options: 'i' } },
            { descripcion: { $regex: searchTerm, $options: 'i' } },
            { codigo: { $regex: searchTerm, $options: 'i' } }
        ];
    }

    const courses = await Course.find(searchFilter)
        .select('codigo nombre descripcion foto fechaInicio fechaFin profesorId')
        .populate('profesorId', 'username fullName avatar')
        .limit(limit)
        .sort({ nombre: 1 });

    return { courses };
};

// HU-21: Matricularse en un curso
const enrollInCourse = async ({ studentId, courseId }) => {
    // Validar estudiante y curso
    await validateUser(studentId);
    const course = await validateCourse(courseId);

    // Verificar que el curso esté publicado
    if (!course.publicado) {
        throw new Error('No puedes matricularte en un curso que no está publicado.');
    }

    // Verificar que no esté ya matriculado
    const existingEnrollment = await Enrollment.findOne({ 
        studentId, 
        courseId, 
        estado: { $in: ['activo', 'completado'] }
    });
    if (existingEnrollment) {
        if (existingEnrollment.estado === 'activo') {
            throw new Error('Ya estás matriculado en este curso.');
        } else {
            throw new Error('Ya completaste este curso.');
        }
    }

    // Verificar que no sea el docente
    if (course.profesorId.toString() === studentId) {
        throw new Error('El docente no puede matricularse en su propio curso.');
    }

    // Crear matrícula
    const enrollmentId = uuidv4();
    const enrollment = new Enrollment({
        _id: enrollmentId,
        studentId,
        courseId,
        estado: 'activo',
        enrolledAt: new Date()
    });

    await enrollment.save();

    // Sincronizar con Neo4j
    await syncEnrollmentToGraph({ userId: studentId, courseId });

    return {
        enrollmentId,
        courseId,
        message: 'Matriculado correctamente en el curso.'
    };
};

// HU-22: Ver cursos matriculados
const getEnrolledCourses = async ({ studentId }) => {
    await validateUser(studentId);

    const enrollments = await Enrollment.find({ 
        studentId, 
        estado: 'activo' 
    })
    .populate({
        path: 'courseId',
        match: { publicado: true },
        select: 'codigo nombre descripcion foto fechaInicio fechaFin profesorId estado',
        populate: {
            path: 'profesorId',
            select: 'username fullName avatar'
        }
    })
    .sort({ enrolledAt: -1 });

    // Filtrar cursos que no estén publicados (por el match en populate)
    const courses = enrollments
        .filter(e => e.courseId)
        .map(e => ({
            ...e.courseId.toObject(),
            enrolledAt: e.enrolledAt,
            estado: e.estado
        }));

    return { courses };
};

// HU-23: Ver contenido de un curso matriculado
const getCourseContent = async ({ studentId, courseId }) => {
    // Validar estudiante
    await validateUser(studentId);

    // Validar curso
    const course = await validateCourse(courseId);

    // Verificar que esté publicado
    if (!course.publicado) {
        throw new Error('El curso no está disponible.');
    }

    // Verificar matrícula activa
    const enrollment = await Enrollment.findOne({ 
        studentId, 
        courseId, 
        estado: 'activo' 
    });
    if (!enrollment) {
        throw new Error('No estás matriculado en este curso o tu matrícula no está activa.');
    }

    // Obtener información básica del curso
    const courseInfo = {
        courseId: course._id,
        codigo: course.codigo,
        nombre: course.nombre,
        descripcion: course.descripcion,
        foto: course.foto,
        fechaInicio: course.fechaInicio,
        fechaFin: course.fechaFin,
        profesorId: course.profesorId
    };

    // Poblar información del profesor
    const professor = await User.findById(course.profesorId).select('username fullName avatar');
    if (professor) {
        courseInfo.profesor = {
            username: professor.username,
            fullName: professor.fullName,
            avatar: professor.avatar
        };
    }

    // Obtener secciones y contenido recursivamente
    const getSectionsWithContent = async (parentSectionId = null) => {
        const sections = await Section.find({ 
            courseId, 
            parentSectionId 
        }).sort({ order: 1 });

        const sectionsWithContent = [];
        
        for (const section of sections) {
            // Obtener contenido de esta sección
            const contents = await Content.find({ sectionId }).sort({ order: 1 });
            
            // Obtener subsecciones recursivamente
            const subsections = await getSectionsWithContent(section._id);
            
            sectionsWithContent.push({
                sectionId: section._id,
                title: section.title,
                order: section.order,
                contents: contents.map(content => ({
                    contentId: content._id,
                    type: content.tipo,
                    data: content.data,
                    order: content.order
                })),
                subsections
            });
        }
        
        return sectionsWithContent;
    };

    const sections = await getSectionsWithContent();

    return {
        course: courseInfo,
        sections,
        enrolledAt: enrollment.enrolledAt
    };
};

// HU-26: Ver compañeros de curso (delegado a Neo4j)
const getCoursemates = async ({ studentId, courseId }) => {
    // Esta función está implementada en Neo4j.model.js y expuesta a través de Social.js
    const { getCoursemates } = require('./Social');
    return getCoursemates({ userId: studentId, courseId });
};

module.exports = {
    searchCourses,
    enrollInCourse,
    getEnrolledCourses,
    getCourseContent,
    getCoursemates
};
