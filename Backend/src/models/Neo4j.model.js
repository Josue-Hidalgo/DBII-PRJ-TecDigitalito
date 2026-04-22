const { getDriver } = require('../config/neo4j');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

/** Abre una sesión de lectura y la cierra al terminar. */
const readSession = () => getDriver().session({ defaultAccessMode: 'READ' });

/** Abre una sesión de escritura y la cierra al terminar. */
const writeSession = () => getDriver().session({ defaultAccessMode: 'WRITE' });

/**
 * Mapea un objeto neo4j Record → objeto JS plano, extrayendo solo las
 * propiedades del nodo/relación en lugar de la envoltura interna de neo4j.
 */
const toPlain = (record, key) => {
    const node = record.get(key);
    return node ? { ...node.properties } : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// NODOS — Crear / actualizar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea o actualiza un nodo :User.
 * Se llama desde Register.js tras guardar en MongoDB.
 *
 * @param {{ userId, username, fullName, avatar }} data
 */
const upsertUser = async ({ userId, username, fullName, avatar = '' }) => {
    const session = writeSession();
    try {
        await session.run(
            `MERGE (u:User { userId: $userId })
             SET u.username = $username,
                 u.fullName = $fullName,
                 u.avatar   = $avatar`,
            { userId, username, fullName: fullName || '', avatar: avatar || '' }
        );
    } finally {
        await session.close();
    }
};

/**
 * Crea o actualiza un nodo :Course.
 * Se llama desde Coursemanagement.js tras guardar en MongoDB.
 *
 * @param {{ courseId, code, name, publicado, estado }} data
 */
const upsertCourse = async ({ courseId, code, name, publicado = false, estado = 'borrador' }) => {
    const session = writeSession();
    try {
        await session.run(
            `MERGE (c:Course { courseId: $courseId })
             SET c.code      = $code,
                 c.name      = $name,
                 c.publicado = $publicado,
                 c.estado    = $estado`,
            { courseId, code, name: name || '', publicado, estado }
        );
    } finally {
        await session.close();
    }
};

/**
 * Marca un curso como publicado en el grafo.
 * Llamado al publicar un curso (HU-15).
 */
const publishCourseNode = async (courseId) => {
    const session = writeSession();
    try {
        await session.run(
            `MATCH (c:Course { courseId: $courseId })
             SET c.publicado = true, c.estado = 'activo'`,
            { courseId }
        );
    } finally {
        await session.close();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// RELACIONES — Matrícula / Docencia
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea relación ENROLLED_IN entre un usuario y un curso (HU-21).
 * Usa MERGE para evitar duplicados.
 */
const enrollUser = async ({ userId, courseId }) => {
    const session = writeSession();
    try {
        await session.run(
            `MATCH (u:User   { userId:   $userId   })
             MATCH (c:Course { courseId: $courseId })
             MERGE (u)-[r:ENROLLED_IN]->(c)
             ON CREATE SET r.enrolledAt = datetime(), r.status = 'activo'`,
            { userId, courseId }
        );
    } finally {
        await session.close();
    }
};

/**
 * Crea relación TEACHES entre un usuario y un curso (HU-11).
 */
const setTeacher = async ({ userId, courseId }) => {
    const session = writeSession();
    try {
        await session.run(
            `MATCH (u:User   { userId:   $userId   })
             MATCH (c:Course { courseId: $courseId })
             MERGE (u)-[r:TEACHES]->(c)
             ON CREATE SET r.since = datetime()`,
            { userId, courseId }
        );
    } finally {
        await session.close();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-27 — Compañeros de curso
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve los estudiantes matriculados en el mismo curso, excluyendo al
 * usuario que consulta.
 *
 * @param {{ userId, courseId }} params
 * @returns {Promise<Array<{ userId, username, fullName, avatar }>>}
 */
const getCoursemates = async ({ userId, courseId }) => {
    const session = readSession();
    try {
        // Verificar que el usuario esté matriculado
        const enrolled = await session.run(
            `MATCH (me:User { userId: $userId })-[:ENROLLED_IN]->(c:Course { courseId: $courseId })
             RETURN c LIMIT 1`,
            { userId, courseId }
        );
        if (enrolled.records.length === 0) {
            throw new Error('No estás matriculado en este curso.');
        }

        const result = await session.run(
            `MATCH (me:User { userId: $userId })-[:ENROLLED_IN]->(c:Course { courseId: $courseId })
             MATCH (mate:User)-[:ENROLLED_IN]->(c)
             WHERE mate.userId <> $userId
             RETURN mate
             ORDER BY mate.fullName ASC`,
            { userId, courseId }
        );

        return result.records.map(r => toPlain(r, 'mate'));
    } finally {
        await session.close();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-28 — Amistad
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envía solicitud de amistad (crea relación FRIENDS_WITH con status='pending').
 * La dirección es requester → target para identificar quién la envió.
 */
const sendFriendRequest = async ({ requesterId, targetId }) => {
    const session = writeSession();
    try {
        // Validar que no sean ya amigos ni haya solicitud pendiente
        const existing = await session.run(
            `MATCH (a:User { userId: $requesterId })-[r:FRIENDS_WITH]-(b:User { userId: $targetId })
             RETURN r LIMIT 1`,
            { requesterId, targetId }
        );
        if (existing.records.length > 0) {
            const rel = existing.records[0].get('r');
            const status = rel.properties.status;
            if (status === 'active') throw new Error('Ya son amigos.');
            if (status === 'pending') throw new Error('Ya existe una solicitud de amistad pendiente.');
        }

        await session.run(
            `MATCH (a:User { userId: $requesterId })
             MATCH (b:User { userId: $targetId })
             CREATE (a)-[:FRIENDS_WITH { since: datetime(), status: 'pending' }]->(b)`,
            { requesterId, targetId }
        );

        return { message: 'Solicitud de amistad enviada.' };
    } finally {
        await session.close();
    }
};

/**
 * Acepta o rechaza una solicitud de amistad.
 *
 * - 'accept': cambia status → 'active' y crea la relación inversa para
 *   facilitar consultas sin dirección.
 * - 'reject': elimina la relación pendiente.
 *
 * @param {{ requesterId, userId, action: 'accept'|'reject' }} params
 */
const respondFriendRequest = async ({ requesterId, userId, action }) => {
    const session = writeSession();
    try {
        const existing = await session.run(
            `MATCH (a:User { userId: $requesterId })-[r:FRIENDS_WITH { status: 'pending' }]->(b:User { userId: $userId })
             RETURN r LIMIT 1`,
            { requesterId, userId }
        );
        if (existing.records.length === 0) {
            throw new Error('Solicitud de amistad no encontrada.');
        }

        if (action === 'accept') {
            // Actualizar relación existente + crear la inversa para queries bidireccionales
            await session.run(
                `MATCH (a:User { userId: $requesterId })-[r:FRIENDS_WITH]->(b:User { userId: $userId })
                 SET r.status = 'active'
                 MERGE (b)-[r2:FRIENDS_WITH]->(a)
                 ON CREATE SET r2.since = datetime(), r2.status = 'active'
                 ON MATCH  SET r2.status = 'active'`,
                { requesterId, userId }
            );
            return { message: 'Solicitud de amistad aceptada.' };
        } else {
            // Rechazar: eliminar
            await session.run(
                `MATCH (a:User { userId: $requesterId })-[r:FRIENDS_WITH { status: 'pending' }]->(b:User { userId: $userId })
                 DELETE r`,
                { requesterId, userId }
            );
            return { message: 'Solicitud de amistad rechazada.' };
        }
    } finally {
        await session.close();
    }
};

/**
 * Devuelve la lista de amigos activos de un usuario.
 *
 * @param {{ userId }} params
 * @returns {Promise<Array<{ userId, username, fullName, avatar }>>}
 */
const getFriends = async ({ userId }) => {
    const session = readSession();
    try {
        const result = await session.run(
            `MATCH (me:User { userId: $userId })-[:FRIENDS_WITH { status: 'active' }]->(friend:User)
             RETURN friend
             ORDER BY friend.fullName ASC`,
            { userId }
        );
        return result.records.map(r => toPlain(r, 'friend'));
    } finally {
        await session.close();
    }
};

/**
 * Devuelve los cursos (como estudiante y como docente) de un amigo.
 * Solo funciona si hay amistad activa entre ambos.
 * No incluye notas (HU-28).
 *
 * @param {{ userId, friendId }} params
 * @returns {Promise<{ enrolled: Course[], teaches: Course[] }>}
 */
const getFriendCourses = async ({ userId, friendId }) => {
    const session = readSession();
    try {
        // Verificar amistad activa en cualquier dirección
        const friendship = await session.run(
            `MATCH (me:User { userId: $userId })-[:FRIENDS_WITH { status: 'active' }]-(friend:User { userId: $friendId })
             RETURN friend LIMIT 1`,
            { userId, friendId }
        );
        if (friendship.records.length === 0) {
            throw new Error('No son amigos o la amistad no está activa.');
        }

        // Cursos como estudiante
        const enrolledResult = await session.run(
            `MATCH (f:User { userId: $friendId })-[:ENROLLED_IN]->(c:Course)
             WHERE c.publicado = true
             RETURN c ORDER BY c.name ASC`,
            { friendId }
        );

        // Cursos como docente
        const teachesResult = await session.run(
            `MATCH (f:User { userId: $friendId })-[:TEACHES]->(c:Course)
             WHERE c.publicado = true
             RETURN c ORDER BY c.name ASC`,
            { friendId }
        );

        return {
            enrolled: enrolledResult.records.map(r => toPlain(r, 'c')),
            teaches:  teachesResult.records.map(r => toPlain(r, 'c')),
        };
    } finally {
        await session.close();
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-29 — Búsqueda de usuarios
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca usuarios cuyo username o fullName contengan el query.
 * Búsqueda case-insensitive con toLower().
 * Limit: 20 resultados por defecto.
 *
 * @param {{ query, limit? }} params
 * @returns {Promise<Array<{ userId, username, fullName, avatar }>>}
 */
const searchUsers = async ({ query, limit = 20 }) => {
    const session = readSession();
    try {
        const q = query.toLowerCase();
        const result = await session.run(
            `MATCH (u:User)
             WHERE toLower(u.username) CONTAINS $q
                OR toLower(u.fullName) CONTAINS $q
             RETURN u
             ORDER BY u.username ASC
             LIMIT $limit`,
            { q, limit: neo4j_int(limit) }
        );
        return result.records.map(r => toPlain(r, 'u'));
    } finally {
        await session.close();
    }
};

/** Helper para convertir números JS a enteros Neo4j. */
const neo4j_int = (n) => {
    const neo4j = require('neo4j-driver');
    return neo4j.int(n);
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades adicionales
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve las solicitudes de amistad pendientes recibidas por un usuario.
 */
const getPendingRequests = async ({ userId }) => {
    const session = readSession();
    try {
        const result = await session.run(
            `MATCH (requester:User)-[:FRIENDS_WITH { status: 'pending' }]->(me:User { userId: $userId })
             RETURN requester
             ORDER BY requester.username ASC`,
            { userId }
        );
        return result.records.map(r => toPlain(r, 'requester'));
    } finally {
        await session.close();
    }
};

/**
 * Verifica si dos usuarios son amigos activos.
 * Útil para validar permisos antes de mostrar datos.
 */
const areFriends = async (userIdA, userIdB) => {
    const session = readSession();
    try {
        const result = await session.run(
            `MATCH (a:User { userId: $userIdA })-[:FRIENDS_WITH { status: 'active' }]-(b:User { userId: $userIdB })
             RETURN a LIMIT 1`,
            { userIdA, userIdB }
        );
        return result.records.length > 0;
    } finally {
        await session.close();
    }
};

module.exports = {
    // Nodos
    upsertUser,
    upsertCourse,
    publishCourseNode,
    // Relaciones curso
    enrollUser,
    setTeacher,
    // HU-27
    getCoursemates,
    // HU-28
    sendFriendRequest,
    respondFriendRequest,
    getFriends,
    getFriendCourses,
    // HU-29
    searchUsers,
    // Utilidades
    getPendingRequests,
    areFriends,
};