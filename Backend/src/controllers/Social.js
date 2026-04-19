// HU-28: Sistema de amigos (ver cursos de amigos)
// HU-29: Buscar usuarios
const { getMongoDB } = require("../config/mongodb");
const { getNeo4jDriver } = require("../config/neo4j");
const { getRedisClient } = require("../config/redis");
const { getCassandraClient } = require("../config/cassandra");

// ──────────────────────────────────────────────────────────────────────────────
// HU-29: Buscar usuarios
// ──────────────────────────────────────────────────────────────────────────────

/**
 * - MongoDB: búsqueda por nombre o username
 * - Redis: cache de resultados por query
 */
async function searchUsers({ query, requesterId, page = 1, pageSize = 20 }) {
  const mongo = await getMongoDB();
  const redis = getRedisClient();

  const cacheKey = `users:search:${query}:${page}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const filter = {
    $or: [
      { username: { $regex: query, $options: "i" } },
      { fullName: { $regex: query, $options: "i" } },
    ],
    _id: { $ne: requesterId }, // excluir al propio usuario
    isActive: true,
  };

  const users = await mongo
    .collection("users")
    .find(filter)
    .project({ fullName: 1, username: 1, photo: 1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray();

  const result = users.map((u) => ({
    userId: u._id,
    username: u.username,
    fullName: u.fullName,
    photo: u.photo,
  }));

  await redis.set(cacheKey, JSON.stringify(result), { EX: 60 });
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-28: Enviar solicitud de amistad / aceptar
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Neo4j almacena la relación de amistad:
 * (:User)-[:FRIEND_REQUEST {status, createdAt}]->(:User)
 * Una vez aceptada: (:User)-[:FRIENDS_WITH {since}]->(:User)
 *
 * Cassandra: auditoría de la acción
 */
async function sendFriendRequest({ requesterId, targetId }) {
  const neo4j = getNeo4jDriver();
  const cassandra = getCassandraClient();
  const mongo = await getMongoDB();

  // Verificar que el target exista
  const target = await mongo.collection("users").findOne({ _id: targetId });
  if (!target) throw new Error("Usuario no encontrado.");

  const session = neo4j.session();
  try {
    // Verificar que no sean ya amigos o que no exista solicitud pendiente
    const existing = await session.run(
      `MATCH (a:User {userId: $requesterId})-[r:FRIEND_REQUEST|FRIENDS_WITH]-(b:User {userId: $targetId})
       RETURN r`,
      { requesterId, targetId }
    );
    if (existing.records.length > 0) {
      throw new Error("Ya existe una solicitud o amistad con este usuario.");
    }

    await session.run(
      `MATCH (a:User {userId: $requesterId}), (b:User {userId: $targetId})
       CREATE (a)-[:FRIEND_REQUEST {status: 'pending', createdAt: $now}]->(b)`,
      { requesterId, targetId, now: new Date().toISOString() }
    );
  } finally {
    await session.close();
  }

  await cassandra.execute(
    `INSERT INTO audit_log (event_id, event_type, user_id, username, timestamp, details, ip_address)
     VALUES (uuid(), 'FRIEND_REQUEST_SENT', ?, 'user', toTimestamp(now()), ?, '0.0.0.0')`,
    [requesterId, JSON.stringify({ targetId })],
    { prepare: true }
  );

  return { success: true, message: "Solicitud de amistad enviada." };
}

async function acceptFriendRequest({ userId, requesterId }) {
  const neo4j = getNeo4jDriver();
  const cassandra = getCassandraClient();

  const session = neo4j.session();
  try {
    // Eliminar la solicitud pendiente y crear relación bidireccional
    await session.run(
      `MATCH (a:User {userId: $requesterId})-[r:FRIEND_REQUEST]->(b:User {userId: $userId})
       DELETE r
       WITH a, b
       CREATE (a)-[:FRIENDS_WITH {since: $now}]->(b)
       CREATE (b)-[:FRIENDS_WITH {since: $now}]->(a)`,
      { requesterId, userId, now: new Date().toISOString() }
    );
  } finally {
    await session.close();
  }

  await cassandra.execute(
    `INSERT INTO audit_log (event_id, event_type, user_id, username, timestamp, details, ip_address)
     VALUES (uuid(), 'FRIEND_REQUEST_ACCEPTED', ?, 'user', toTimestamp(now()), ?, '0.0.0.0')`,
    [userId, JSON.stringify({ requesterId })],
    { prepare: true }
  );

  return { success: true, message: "Amistad confirmada." };
}

/**
 * Lista los amigos de un usuario.
 */
async function getFriends({ userId }) {
  const neo4j = getNeo4jDriver();
  const mongo = await getMongoDB();

  const session = neo4j.session();
  let friendIds = [];
  try {
    const result = await session.run(
      `MATCH (u:User {userId: $userId})-[:FRIENDS_WITH]->(f:User)
       RETURN f.userId AS friendId`,
      { userId }
    );
    friendIds = result.records.map((r) => r.get("friendId"));
  } finally {
    await session.close();
  }

  if (friendIds.length === 0) return [];

  const friends = await mongo
    .collection("users")
    .find({ _id: { $in: friendIds } }, { projection: { fullName: 1, username: 1, photo: 1 } })
    .toArray();

  return friends.map((f) => ({ userId: f._id, fullName: f.fullName, username: f.username, photo: f.photo }));
}

// ──────────────────────────────────────────────────────────────────────────────
// HU-28: Ver cursos de un amigo (como estudiante o docente, sin notas)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Solo accesible si son amigos. No expone notas.
 *
 * - Neo4j: verificar relación FRIENDS_WITH
 * - MongoDB: traer cursos como docente y como estudiante
 */
async function getFriendCourses({ userId, friendId }) {
  const neo4j = getNeo4jDriver();
  const mongo = await getMongoDB();

  // Verificar amistad en Neo4j
  const session = neo4j.session();
  let areFriends = false;
  try {
    const result = await session.run(
      `MATCH (a:User {userId: $userId})-[:FRIENDS_WITH]->(b:User {userId: $friendId})
       RETURN COUNT(a) AS count`,
      { userId, friendId }
    );
    areFriends = result.records[0]?.get("count").toNumber() > 0;
  } finally {
    await session.close();
  }

  if (!areFriends) throw new Error("No eres amigo de este usuario.");

  // Cursos como docente (publicados)
  const teachingCourses = await mongo
    .collection("courses")
    .find({ teacherId: friendId, isPublished: true })
    .project({ name: 1, code: 1, description: 1, photo: 1, startDate: 1, endDate: 1 })
    .toArray();

  // Cursos como estudiante (matriculado, publicados — sin notas)
  const enrollments = await mongo.collection("enrollments").find({ studentId: friendId }).toArray();
  const enrolledIds = enrollments.map((e) => e.courseId);
  const studentCourses = await mongo
    .collection("courses")
    .find({ _id: { $in: enrolledIds }, isPublished: true })
    .project({ name: 1, code: 1, description: 1, photo: 1, startDate: 1 })
    .toArray();

  return {
    teaching: teachingCourses.map((c) => ({ courseId: c._id, ...c })),
    enrolled: studentCourses.map((c) => ({ courseId: c._id, ...c })),
    // Nota: las calificaciones NUNCA se exponen aquí (HU-28)
  };
}

/**
 * Solicitudes de amistad pendientes recibidas por el usuario.
 */
async function getPendingFriendRequests({ userId }) {
  const neo4j = getNeo4jDriver();
  const mongo = await getMongoDB();

  const session = neo4j.session();
  let requesterIds = [];
  try {
    const result = await session.run(
      `MATCH (r:User)-[:FRIEND_REQUEST]->(u:User {userId: $userId})
       RETURN r.userId AS requesterId`,
      { userId }
    );
    requesterIds = result.records.map((rec) => rec.get("requesterId"));
  } finally {
    await session.close();
  }

  if (requesterIds.length === 0) return [];

  const requesters = await mongo
    .collection("users")
    .find({ _id: { $in: requesterIds } }, { projection: { fullName: 1, username: 1, photo: 1 } })
    .toArray();

  return requesters.map((r) => ({ userId: r._id, fullName: r.fullName, username: r.username }));
}

module.exports = {
  searchUsers,
  sendFriendRequest,
  acceptFriendRequest,
  getFriends,
  getFriendCourses,
  getPendingFriendRequests,
};