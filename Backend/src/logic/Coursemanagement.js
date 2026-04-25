const { v4: uuidv4 } = require('uuid');
const Course = require('../models/Course.model');
const Section = require('../models/Section.model');
const Content = require('../models/Content.model');
const Enrollment = require('../models/Enrollment.model');
const User = require('../models/User.model');
const { syncCourseToGraph, syncPublishToGraph } = require('./Social');

// Helper para validar que un usuario exista y retornar sus datos
const validateUser = async (userId) => {
    const user = await User.findById(userId).lean();
    if (!user) throw new Error('Usuario no encontrado.');
    return user;
};

// Helper para validar que un curso exista
const validateCourse = async (courseId) => {
    const course = await Course.findById(courseId).lean();
    if (!course) throw new Error('Curso no encontrado.');
    return course;
};

// Helper para verificar que el usuario sea el docente del curso
// El schema guarda docente.user_id como String, y _id de Mongo es ObjectId,
// por eso se comparan ambos como strings.
const assertTeacher = (course, teacherId) => {
    if (course.docente.user_id.toString() !== teacherId.toString()) {
        throw new Error('Solo el docente del curso puede realizar esta acción.');
    }
};

// HU-11: Crear un curso
const createCourse = async ({ teacherId, code, name, description, startDate, endDate, photoBase64 }) => {
    // Verificar que el código no exista
    const existingCourse = await Course.findOne({ codigo: code.trim().toUpperCase() });
    if (existingCourse) throw new Error('El código de curso ya está en uso.');

    // Obtener información del docente
    const teacher = await validateUser(teacherId);
    const teacherName = teacher.fullName || teacher.username || 'Docente Desconocido';

    console.log('DEBUG: Teacher data:', teacher);
    console.log('DEBUG: TeacherName:', teacherName);
    console.log('DEBUG: TeacherId:', teacherId.toString());
    
    const courseData = {
        codigo:       code.trim().toUpperCase(),
        nombre:       name.trim(),
        descripcion:  description.trim(),
        fecha_inicio: new Date(startDate),
        fecha_fin:    endDate ? new Date(endDate) : null,
        foto:         photoBase64 || '',
        docente: {
            user_id: teacherId.toString(),
            nombre:  teacherName,
        },
        publicado: false,
        estado:    'borrador',
    };
    
    console.log('DEBUG: Course data to save:', courseData);
    
    const course = new Course(courseData);

    await course.save();

    // Sincronizar con Neo4j
    await syncCourseToGraph({
        courseId:  course._id.toString(),
        code:      course.codigo,
        name:      course.nombre,
        teacherId: teacherId.toString(),
        publicado: false,
        estado:    'borrador',
    });

    return {
        courseId: course._id.toString(),
        code:     course.codigo,
        name:     course.nombre,
        message:  'Curso creado correctamente.',
    };
};

// HU-12: Agregar sección a un curso
const addSection = async ({ courseId, teacherId, title, parentSectionId, order }) => {
    const course = await validateCourse(courseId);
    assertTeacher(course, teacherId);

    const sectionId = uuidv4();
    const section = new Section({
        _id:             sectionId,
        courseId,
        title:           title.trim(),
        parentSectionId: parentSectionId || null,
        orden:           order ?? 0,
    });

    await section.save();

    return {
        sectionId,
        title:   section.title,
        message: 'Sección agregada correctamente.',
    };
};

// HU-13: Agregar contenido a una sección
const addContentToSection = async ({ courseId, teacherId, sectionId, contentType, payload }) => {
    const course = await validateCourse(courseId);
    assertTeacher(course, teacherId);

    const section = await Section.findById(sectionId).lean();
    if (!section || section.courseId.toString() !== courseId.toString()) {
        throw new Error('Sección no encontrada o no pertenece a este curso.');
    }

    const validTypes = ['texto', 'documento', 'video', 'imagen'];
    if (!validTypes.includes(contentType)) {
        throw new Error('Tipo de contenido no válido.');
    }

    const contentId = uuidv4();
    const content = new Content({
        _id:       contentId,
        sectionId,
        tipo:      contentType,
        data:      payload,
        orden:     payload.orden ?? 0,
    });

    await content.save();

    return {
        contentId,
        type:    contentType,
        message: 'Contenido agregado correctamente.',
    };
};

// HU-15: Publicar un curso
const publishCourse = async ({ courseId, teacherId }) => {
    // findById con lean() no devuelve métodos de mongoose; usamos el documento completo
    const course = await Course.findById(courseId);
    if (!course) throw new Error('Curso no encontrado.');
    assertTeacher(course.toObject ? course.toObject() : course, teacherId);

    if (course.publicado) {
        throw new Error('El curso ya está publicado.');
    }

    course.publicado   = true;
    course.estado      = 'activo';
    course.publishedAt = new Date();
    await course.save();

    // Sincronizar con Neo4j
    await syncPublishToGraph(courseId);

    return {
        courseId,
        message: 'Curso publicado correctamente.',
    };
};

// HU-16: Ver estudiantes matriculados
const getEnrolledStudents = async ({ courseId, teacherId }) => {
    const course = await validateCourse(courseId);
    assertTeacher(course, teacherId);

    const enrollments = await Enrollment.find({ courseId, estado: 'activo' })
        .sort({ enrolledAt: 1 })
        .lean();

    // Enriquecer con datos del estudiante desde MongoDB
    const students = await Promise.all(
        enrollments.map(async (e) => {
            const student = await User.findById(e.studentId)
                .select('username fullName avatar')
                .lean();
            return student
                ? {
                    studentId:  student._id,
                    username:   student.username,
                    fullName:   student.fullName,
                    avatar:     student.avatar,
                    enrolledAt: e.enrolledAt,
                }
                : null;
        })
    );

    return { students: students.filter(Boolean) };
};

// HU-18: Ver cursos del docente
const getTeacherCourses = async ({ teacherId }) => {
    await validateUser(teacherId);

    // El campo correcto en el schema es docente.user_id
    const courses = await Course.find({ 'docente.user_id': teacherId.toString() })
        .sort({ createdAt: -1 })
        .lean();

    return { courses };
};

const getSections = async ({ courseId, teacherId }) => {
  const course = await Course.findById(courseId);

  if (!course) {
    throw new Error('Curso no encontrado.');
  }

  if (course.docente?.user_id?.toString() !== teacherId.toString()) {
    throw new Error('No tienes permiso para ver las secciones de este curso.');
  }

  const sections = await Section.find({ courseId }).sort({ order: 1 });

  return { sections };
};

// HU-19: Clonar un curso
const cloneCourse = async ({ originalCourseId, teacherId, newCode, newName, newStartDate, newEndDate }) => {
    const originalCourse = await validateCourse(originalCourseId);
    assertTeacher(originalCourse, teacherId);

    // Validar que el nuevo código no exista
    const existingCourse = await Course.findOne({ codigo: newCode.trim().toUpperCase() }).lean();
    if (existingCourse) throw new Error('El código de curso ya está en uso.');

    // Obtener datos actualizados del docente
    const teacher     = await validateUser(teacherId);
    const teacherName = teacher.fullName || teacher.username || 'Docente Desconocido';

    const newCourseId = uuidv4();
    const newCourse = new Course({
        _id:              newCourseId,
        codigo:           newCode.trim().toUpperCase(),
        nombre:           newName.trim(),
        descripcion:      originalCourse.descripcion,
        fecha_inicio:     new Date(newStartDate),
        fecha_fin:        newEndDate ? new Date(newEndDate) : null,
        foto:             originalCourse.foto,
        docente: {
            user_id: teacherId.toString(),
            nombre:  teacherName,
        },
        publicado:          false,
        estado:             'borrador',
        original_course_id: originalCourseId,
    });

    await newCourse.save();

    // Sincronizar con Neo4j
    await syncCourseToGraph({
        courseId:  newCourseId,
        code:      newCourse.codigo,
        name:      newCourse.nombre,
        teacherId: teacherId.toString(),
        publicado: false,
        estado:    'borrador',
    });

    // Clonar secciones y contenido
    const sections = await Section.find({ courseId: originalCourseId }).sort({ orden: 1 }).lean();
    const sectionMap = new Map(); // oldId -> newId

    for (const section of sections) {
        const newSectionId = uuidv4();
        sectionMap.set(section._id.toString(), newSectionId);

        const newSection = new Section({
            _id:             newSectionId,
            courseId:        newCourseId,
            title:           section.title,
            descripcion:     section.descripcion || null,
            parentSectionId: section.parentSectionId
                ? sectionMap.get(section.parentSectionId.toString()) || null
                : null,
            orden: section.orden ?? 0,
        });

        await newSection.save();

        // Clonar contenido de la sección
        const contents = await Content.find({ sectionId: section._id }).lean();
        for (const content of contents) {
            const newContent = new Content({
                _id:       uuidv4(),
                sectionId: newSectionId,
                tipo:      content.tipo,
                data:      content.data,
                orden:     content.orden ?? 0,
            });
            await newContent.save();
        }
    }

    return {
        courseId: newCourseId,
        code:     newCourse.codigo,
        name:     newCourse.nombre,
        message:  'Curso clonado correctamente.',
    };
};

module.exports = {
    createCourse,
    addSection,
    addContentToSection,
    publishCourse,
    getEnrolledStudents,
    getTeacherCourses,
    getSections,
    cloneCourse,
};