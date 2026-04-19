/**
 * Social.js — Lógica de negocio para HU-27, HU-28, HU-29, HU-30.
 *
 * Neo4j maneja el grafo social (amistades, compañeros de curso, búsqueda).
 * MongoDB maneja el contenido de los mensajes directos (HU-30).
 *
 * Las funciones de mensajería directa ya están en Messages.js; aquí solo
 * se re-exportan para que el Social.controller pueda importar desde un
 * único lugar.
 */

const Neo4j = require('../models/Neo4j.model');
const User  = require('../models/User.model');
const {
    CourseThread,
    CourseMessage,
    DirectMessage,
    Conversation,
} = require('../models/Messages.model');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────────────────────────────────────
// HU-27 — Ver compañeros de curso
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve la lista de otros estudiantes matriculados en el mismo curso.
 * El usuario debe estar matriculado para poder verlos.
 *
 * @param {{ userId, courseId }} params
 * @returns {Promise<{ coursemates: Array }>}
 */
const getCoursemates = async ({ userId, courseId }) => {
    const coursemates = await Neo4j.getCoursemates({ userId, courseId });
    return { coursemates };
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-28 — Amistades
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envía una solicitud de amistad a otro usuario.
 * Valida que ambos usuarios existan en MongoDB antes de tocar Neo4j.
 *
 * @param {{ requesterId, targetId }} params
 */
const sendFriendRequest = async ({ requesterId, targetId }) => {
    if (requesterId === targetId) {
        throw new Error('No puedes enviarte una solicitud de amistad a ti mismo.');
    }

    // Verificar existencia en MongoDB
    const [requester, target] = await Promise.all([
        User.findById(requesterId).lean(),
        User.findById(targetId).lean(),
    ]);
    if (!requester) throw new Error('Usuario solicitante no encontrado.');
    if (!target)    throw new Error('Usuario destino no encontrado.');

    return Neo4j.sendFriendRequest({ requesterId, targetId });
};

/**
 * Acepta o rechaza una solicitud de amistad recibida.
 *
 * @param {{ requesterId, userId, action: 'accept'|'reject' }} params
 */
const respondFriendRequest = async ({ requesterId, userId, action }) => {
    return Neo4j.respondFriendRequest({ requesterId, userId, action });
};

/**
 * Devuelve los amigos activos de un usuario.
 *
 * @param {{ userId }} params
 * @returns {Promise<{ friends: Array, pendingRequests: Array }>}
 */
const getFriends = async ({ userId }) => {
    const [friends, pendingRequests] = await Promise.all([
        Neo4j.getFriends({ userId }),
        Neo4j.getPendingRequests({ userId }),
    ]);
    return { friends, pendingRequests };
};

/**
 * Devuelve los cursos (matriculado y docente) de un amigo.
 * No incluye notas bajo ningún concepto (HU-28).
 *
 * @param {{ userId, friendId }} params
 * @returns {Promise<{ enrolled: Course[], teaches: Course[] }>}
 */
const getFriendCourses = async ({ userId, friendId }) => {
    return Neo4j.getFriendCourses({ userId, friendId });
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-29 — Búsqueda de usuarios
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca usuarios por username o nombre completo.
 * Devuelve máximo 20 resultados para no saturar la UI.
 *
 * @param {{ query, limit? }} params
 * @returns {Promise<{ users: Array }>}
 */
const searchUsers = async ({ query, limit = 20 }) => {
    if (!query || query.trim().length === 0) {
        throw new Error('El término de búsqueda no puede estar vacío.');
    }
    const users = await Neo4j.searchUsers({ query: query.trim(), limit });
    return { users };
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-30 — Mensajes directos entre usuarios
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera una clave canónica de conversación entre dos usuarios.
 * Siempre el mismo resultado independientemente del orden de los IDs.
 */
const conversationKey = (a, b) => [a, b].sort().join('_');

/**
 * Envía un mensaje directo de un usuario a otro.
 * Crea o actualiza el registro de conversación en MongoDB.
 * (El grafo social en Neo4j no almacena mensajes; solo relaciones.)
 *
 * @param {{ senderId, recipientId, text, replyToId? }} params
 * @returns {Promise<{ message: object, conversation: object }>}
 */
const sendDirectMessage = async ({ senderId, recipientId, text, replyToId = null }) => {
    if (senderId === recipientId) {
        throw new Error('No puedes enviarte mensajes a ti mismo.');
    }

    // Verificar que ambos usuarios existan
    const [sender, recipient] = await Promise.all([
        User.findById(senderId).lean(),
        User.findById(recipientId).lean(),
    ]);
    if (!sender)    throw new Error('Remitente no encontrado.');
    if (!recipient) throw new Error('Destinatario no encontrado.');

    const convKey   = conversationKey(senderId, recipientId);
    const messageId = uuidv4();
    const now       = new Date();

    // Crear el mensaje
    const newMessage = new DirectMessage({
        _id:             messageId,
        conversationKey: convKey,
        senderId,
        recipientId,
        sender_nombre:   sender.fullName,
        contenido:       text.trim(),
        respuesta_a:     replyToId,
        leido:           false,
        sentAt:          now,
    });
    await newMessage.save();

    // Upsert del registro de conversación (para bandeja de entrada)
    const preview = text.trim().substring(0, 60);
    const conv = await Conversation.findOneAndUpdate(
        { conversationKey: convKey },
        {
            $set: {
                lastPreview:   preview,
                lastMessageAt: now,
                updatedAt:     now,
            },
            $setOnInsert: {
                _id:             uuidv4(),
                conversationKey: convKey,
                participants:    [senderId, recipientId],
                createdAt:       now,
            },
        },
        { upsert: true, new: true }
    );

    return {
        message:      newMessage.toObject(),
        conversation: conv.toObject(),
    };
};

/**
 * Devuelve los mensajes directos entre dos usuarios, ordenados por fecha.
 *
 * @param {{ userId, otherUserId, limit? }} params
 * @returns {Promise<{ messages: Array }>}
 */
const getDirectMessages = async ({ userId, otherUserId, limit = 50 }) => {
    const convKey = conversationKey(userId, otherUserId);

    const messages = await DirectMessage
        .find({ conversationKey: convKey })
        .sort({ sentAt: 1 })
        .limit(limit)
        .lean();

    // Marcar como leídos los mensajes recibidos por userId
    await DirectMessage.updateMany(
        { conversationKey: convKey, recipientId: userId, leido: false },
        { $set: { leido: true } }
    );

    return { messages };
};

/**
 * Devuelve la bandeja de entrada: lista de conversaciones del usuario,
 * ordenadas por el mensaje más reciente primero.
 *
 * @param {{ userId }} params
 * @returns {Promise<{ conversations: Array }>}
 */
const getConversations = async ({ userId }) => {
    const conversations = await Conversation
        .find({ participants: userId })
        .sort({ lastMessageAt: -1 })
        .lean();

    // Enriquecer con datos del otro participante (traídos de Neo4j para evitar
    // un join a MongoDB users, que ya tiene índice en _id de todas formas)
    const enriched = await Promise.all(
        conversations.map(async (conv) => {
            const otherId = conv.participants.find(p => p !== userId);
            let otherUser = null;

            try {
                // Intentar desde el grafo; si no está, desde MongoDB
                const [neo4jResult] = await Neo4j.searchUsers({ query: otherId, limit: 1 })
                    .then(r => r.users).catch(() => []);

                if (neo4jResult && neo4jResult.userId === otherId) {
                    otherUser = neo4jResult;
                } else {
                    const mongoUser = await User.findById(otherId).select('username fullName avatar').lean();
                    if (mongoUser) {
                        otherUser = {
                            userId:   mongoUser._id,
                            username: mongoUser.username,
                            fullName: mongoUser.fullName,
                            avatar:   mongoUser.avatar,
                        };
                    }
                }
            } catch (_) {
                // Silenciar errores de enriquecimiento; la conversación se devuelve igual
            }

            return { ...conv, otherUser };
        })
    );

    return { conversations: enriched };
};

// ─────────────────────────────────────────────────────────────────────────────
// Sincronización con Neo4j (llamadas desde otros módulos de lógica)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sincroniza un usuario recién registrado al grafo.
 * Debe llamarse desde Register.js tras guardar en MongoDB.
 */
const syncUserToGraph = async ({ userId, username, fullName, avatar }) => {
    try {
        await Neo4j.upsertUser({ userId, username, fullName, avatar });
    } catch (err) {
        // No bloquear el registro si Neo4j falla; logear y continuar
        console.error('[Neo4j sync] Error al sincronizar usuario:', err.message);
    }
};

/**
 * Sincroniza un curso al grafo.
 * Debe llamarse desde Coursemanagement.js tras guardar en MongoDB.
 */
const syncCourseToGraph = async ({ courseId, code, name, teacherId, publicado, estado }) => {
    try {
        await Neo4j.upsertCourse({ courseId, code, name, publicado, estado });
        if (teacherId) {
            await Neo4j.setTeacher({ userId: teacherId, courseId });
        }
    } catch (err) {
        console.error('[Neo4j sync] Error al sincronizar curso:', err.message);
    }
};

/**
 * Sincroniza una matrícula al grafo.
 * Debe llamarse desde Enrollment.js tras guardar en MongoDB.
 */
const syncEnrollmentToGraph = async ({ userId, courseId }) => {
    try {
        await Neo4j.enrollUser({ userId, courseId });
    } catch (err) {
        console.error('[Neo4j sync] Error al sincronizar matrícula:', err.message);
    }
};

/**
 * Marca un curso como publicado en el grafo.
 * Debe llamarse desde Coursemanagement.js al publicar.
 */
const syncPublishToGraph = async (courseId) => {
    try {
        await Neo4j.publishCourseNode(courseId);
    } catch (err) {
        console.error('[Neo4j sync] Error al publicar curso en grafo:', err.message);
    }
};

module.exports = {
    // HU-27
    getCoursemates,
    // HU-28
    sendFriendRequest,
    respondFriendRequest,
    getFriends,
    getFriendCourses,
    // HU-29
    searchUsers,
    // HU-30
    sendDirectMessage,
    getDirectMessages,
    getConversations,
    // Sync helpers
    syncUserToGraph,
    syncCourseToGraph,
    syncEnrollmentToGraph,
    syncPublishToGraph,
};