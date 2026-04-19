// HU-7: Recuperar contraseña  |  HU-8: Cambio de contraseña
const { getMongoDB } = require("../config/mongodb");
const { getCassandraClient } = require("../config/cassandra");
const { getRedisClient } = require("../config/redis");
const crypto = require("crypto");

const RESET_TOKEN_TTL_SECONDS = 60 * 15; // 15 minutos

function hashPassword(password, salt) {
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

function generateSalt() {
  return crypto.randomBytes(32).toString("hex");
}

function isStrongPassword(password) {
  // Mínimo 8 caracteres, al menos 1 mayúscula, 1 número y 1 símbolo
  return /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/.test(password);
}

/**
 * HU-7 Paso 1: Solicitar token de recuperación
 * - MongoDB: verificar que el usuario exista
 * - Redis: guardar el token de un solo uso con expiración corta
 * Retorna el token (en producción se enviaría solo por correo)
 */
async function requestPasswordReset({ username }) {
  const mongo = await getMongoDB();
  const redis = getRedisClient();
  const cassandra = getCassandraClient();

  const user = await mongo.collection("users").findOne({ username });
  // Respuesta genérica para no revelar si el usuario existe
  if (!user) return { success: true, message: "Si el usuario existe, recibirá un correo." };

  const resetToken = crypto.randomBytes(48).toString("hex");

  // ─── Redis: token de un solo uso con TTL corto ──────────────────────────
  await redis.set(
    `reset_token:${resetToken}`,
    JSON.stringify({ userId: user._id, username: user.username }),
    { EX: RESET_TOKEN_TTL_SECONDS }
  );

  // ─── Cassandra: auditoría ───────────────────────────────────────────────
  await cassandra.execute(
    `INSERT INTO audit_log (
      event_id, event_type, user_id, username,
      timestamp, details, ip_address
    ) VALUES (uuid(), 'PASSWORD_RESET_REQUESTED', ?, ?, toTimestamp(now()), ?, '0.0.0.0')`,
    [user._id, username, JSON.stringify({ tokenGenerated: true })],
    { prepare: true }
  );

  // En producción: enviar resetToken por correo al usuario
  console.log(`[MAIL] Enlace de recuperación para ${username}: /reset?token=${resetToken}`);

  return { success: true, message: "Si el usuario existe, recibirá un correo.", resetToken };
}

/**
 * HU-7 Paso 2: Usar el token para restablecer la contraseña
 * - Redis: verificar y consumir el token (invalidar tras el uso)
 * - MongoDB: actualizar contraseña hasheada y salt
 * - Cassandra: auditoría del cambio
 */
async function resetPassword({ resetToken, newPassword }) {
  const redis = getRedisClient();
  const mongo = await getMongoDB();
  const cassandra = getCassandraClient();

  if (!isStrongPassword(newPassword)) {
    throw new Error("La contraseña no cumple la política de seguridad.");
  }

  // ─── Redis: obtener y eliminar el token (un solo uso) ───────────────────
  const raw = await redis.get(`reset_token:${resetToken}`);
  if (!raw) throw new Error("Token inválido o expirado.");
  const { userId, username } = JSON.parse(raw);
  await redis.del(`reset_token:${resetToken}`);

  const newSalt = generateSalt();
  const newHash = hashPassword(newPassword, newSalt);

  // ─── MongoDB: actualizar credenciales ───────────────────────────────────
  await mongo.collection("users").updateOne(
    { _id: userId },
    {
      $set: {
        password: newHash,
        salt: newSalt,
        failedLoginAttempts: 0,
        isBlocked: false,
        blockedUntil: null,
        updatedAt: new Date(),
      },
    }
  );

  // ─── Cassandra: auditoría ───────────────────────────────────────────────
  await cassandra.execute(
    `INSERT INTO audit_log (
      event_id, event_type, user_id, username,
      timestamp, details, ip_address
    ) VALUES (uuid(), 'PASSWORD_RESET_COMPLETED', ?, ?, toTimestamp(now()), ?, '0.0.0.0')`,
    [userId, username, JSON.stringify({ via: "reset_token" })],
    { prepare: true }
  );

  return { success: true, message: "Contraseña restablecida correctamente." };
}

/**
 * HU-8: Cambio de contraseña (usuario autenticado)
 * - MongoDB: verificar contraseña actual y actualizar
 * - Cassandra: auditoría del cambio
 * - Redis: invalidar todas las sesiones activas por seguridad
 */
async function changePassword({ userId, currentPassword, newPassword }) {
  const mongo = await getMongoDB();
  const cassandra = getCassandraClient();
  const redis = getRedisClient();

  if (!isStrongPassword(newPassword)) {
    throw new Error("La contraseña no cumple la política de seguridad.");
  }

  const user = await mongo.collection("users").findOne({ _id: userId });
  if (!user) throw new Error("Usuario no encontrado.");

  const currentHash = hashPassword(currentPassword, user.salt);
  if (currentHash !== user.password) {
    throw new Error("La contraseña actual es incorrecta.");
  }

  const newSalt = generateSalt();
  const newHash = hashPassword(newPassword, newSalt);

  // ─── MongoDB: guardar nueva contraseña ──────────────────────────────────
  await mongo.collection("users").updateOne(
    { _id: userId },
    { $set: { password: newHash, salt: newSalt, updatedAt: new Date() } }
  );

  // ─── Redis: invalidar todas las sesiones (forzar re-login) ──────────────
  const tokens = await redis.sMembers(`user_sessions:${userId}`);
  if (tokens.length > 0) {
    const pipeline = redis.multi();
    for (const token of tokens) pipeline.del(`session:${token}`);
    pipeline.del(`user_sessions:${userId}`);
    await pipeline.exec();
  }

  // ─── Cassandra: auditoría ───────────────────────────────────────────────
  await cassandra.execute(
    `INSERT INTO audit_log (
      event_id, event_type, user_id, username,
      timestamp, details, ip_address
    ) VALUES (uuid(), 'PASSWORD_CHANGED', ?, ?, toTimestamp(now()), ?, '0.0.0.0')`,
    [userId, user.username, JSON.stringify({ sessionsInvalidated: tokens.length })],
    { prepare: true }
  );

  return { success: true, message: "Contraseña cambiada. Todas las sesiones han sido cerradas." };
}

module.exports = { requestPasswordReset, resetPassword, changePassword };