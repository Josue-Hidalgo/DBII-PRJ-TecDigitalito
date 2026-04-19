// HU-1: Registro de usuario
const { getMongoDB } = require("../config/mongodb");
const { getCassandraClient } = require("../config/cassandra");
const { getRedisClient } = require("../config/redis");
const { getNeo4jDriver } = require("../config/neo4j");
const crypto = require("crypto");

/**
 * Genera un salt aleatorio y retorna el hash SHA-256 de (password + salt)
 */
function hashPassword(password, salt) {
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

function generateSalt() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * HU-1: Registro de usuario
 * - MongoDB: datos principales del usuario
 * - Cassandra: log de registro (auditoría)
 * - Neo4j: nodo de usuario para relaciones futuras
 */
async function registerUser({ username, password, fullName, birthDate, photoBase64 }) {
  const mongo = await getMongoDB();
  const cassandra = getCassandraClient();
  const neo4j = getNeo4jDriver();

  // Verificar si el username ya existe
  const existing = await mongo.collection("users").findOne({ username });
  if (existing) {
    throw new Error("El nombre de usuario ya está en uso.");
  }

  const salt = generateSalt();
  const hashedPassword = hashPassword(password, salt);
  const userId = crypto.randomUUID();
  const now = new Date();

  // ─── MongoDB: documento principal del usuario ───────────────────────────
  const userDoc = {
    _id: userId,
    username,
    password: hashedPassword,
    salt,
    fullName,
    birthDate: new Date(birthDate),
    photo: photoBase64 || null,
    isActive: true,
    isBlocked: false,
    blockedUntil: null,
    failedLoginAttempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  await mongo.collection("users").insertOne(userDoc);

  // ─── Neo4j: nodo Usuario para relaciones sociales ───────────────────────
  const session = neo4j.session();
  try {
    await session.run(
      `CREATE (u:User {
        userId: $userId,
        username: $username,
        fullName: $fullName,
        createdAt: $createdAt
      })`,
      { userId, username, fullName, createdAt: now.toISOString() }
    );
  } finally {
    await session.close();
  }

  // ─── Cassandra: auditoría del registro ──────────────────────────────────
  await cassandra.execute(
    `INSERT INTO audit_log (
      event_id, event_type, user_id, username,
      timestamp, details, ip_address
    ) VALUES (uuid(), 'USER_REGISTERED', ?, ?, toTimestamp(now()), ?, '0.0.0.0')`,
    [userId, username, JSON.stringify({ fullName })],
    { prepare: true }
  );

  return { userId, username, fullName };
}

module.exports = { registerUser };