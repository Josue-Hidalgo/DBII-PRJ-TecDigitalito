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
        .select('codigo nombre descripcion foto fecha_inicio fecha_fin docente publicado')
        .limit(limit)
        .sort({ nombre: 1 });

    const coursesWithTeacher = await Promise.all(
        courses.map(async (course) => {
            const obj = course.toObject();

            const teacher = await User.findById(course.docente?.user_id)
                .select('username fullName avatar');

            obj.profesor = teacher ? {
                userId: teacher._id,
                username: teacher.username,
                fullName: teacher.fullName,
                avatar: teacher.avatar
            } : {
                userId: course.docente?.user_id,
                fullName: course.docente?.nombre
            };

            return obj;
        })
    );

    return { courses: coursesWithTeacher };
};

// HU-21: Matricularse en un curso
const enrollInCourse = async ({ studentId, courseId }) => {
    await validateUser(studentId);
    const course = await validateCourse(courseId);

    if (!course.publicado) {
        throw new Error('No puedes matricularte en un curso que no está publicado.');
    }

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

    // Verificar que el usuario no sea el docente del curso
    if (course.docente?.user_id?.toString() === studentId.toString()) {
        throw new Error('El docente no puede matricularse en su propio curso.');
    }

    const enrollmentId = uuidv4();

    const enrollment = new Enrollment({
        _id: enrollmentId,
        studentId,
        courseId,
        estado: 'activo',
        enrolledAt: new Date()
    });

    await enrollment.save();

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
            select: 'codigo nombre descripcion foto fecha_inicio fecha_fin docente estado publicado'
        })
        .sort({ enrolledAt: -1 });

    const courses = await Promise.all(
        enrollments
            .filter(e => e.courseId)
            .map(async (e) => {
                const course = e.courseId.toObject();

                const teacher = await User.findById(e.courseId.docente?.user_id)
                    .select('username fullName avatar');

                course.profesor = teacher ? {
                    userId: teacher._id,
                    username: teacher.username,
                    fullName: teacher.fullName,
                    avatar: teacher.avatar
                } : {
                    userId: e.courseId.docente?.user_id,
                    fullName: e.courseId.docente?.nombre
                };

                return {
                    ...course,
                    enrolledAt: e.enrolledAt,
                    estadoMatricula: e.estado
                };
            })
    );

    return { courses };
};

// HU-23: Ver contenido de un curso matriculado
const getCourseContent = async ({ studentId, courseId }) => {
    await validateUser(studentId);

    const course = await validateCourse(courseId);

    if (!course.publicado) {
        throw new Error('El curso no está disponible.');
    }

    const enrollment = await Enrollment.findOne({
        studentId,
        courseId,
        estado: 'activo'
    });

    if (!enrollment) {
        throw new Error('No estás matriculado en este curso o tu matrícula no está activa.');
    }

    const courseInfo = {
        courseId: course._id,
        codigo: course.codigo,
        nombre: course.nombre,
        descripcion: course.descripcion,
        foto: course.foto,
        fechaInicio: course.fecha_inicio,
        fechaFin: course.fecha_fin,
        docente: course.docente
    };

    const professor = await User.findById(course.docente?.user_id)
        .select('username fullName avatar');

    if (professor) {
        courseInfo.profesor = {
            userId: professor._id,
            username: professor.username,
            fullName: professor.fullName,
            avatar: professor.avatar
        };
    } else {
        courseInfo.profesor = {
            userId: course.docente?.user_id,
            fullName: course.docente?.nombre
        };
    }

    const getSectionsWithContent = async (parentSectionId = null) => {
        const sections = await Section.find({
            courseId,
            parentSectionId
        }).sort({ order: 1 });

        const sectionsWithContent = [];

        for (const section of sections) {
            const contents = await Content.find({ sectionId: section._id }).sort({ order: 1 });

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

// HU-26: Ver compañeros de curso
const getCoursemates = async ({ studentId, courseId }) => {
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