// HU-2, HU-3, HU-4: Inicio de sesión, Bloqueo y Actividad Sospechosa
const { getMongoDB } = require("../config/mongodb");
const { getCassandraClient } = require("../config/cassandra");
const { getRedisClient } = require("../config/redis");
const crypto = require("crypto");

const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION_SECONDS = 15 * 60; // 15 minutos
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 horas

function hashPassword(password, salt) {
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

function generateSessionToken() {
  return crypto.randomBytes(64).toString("hex");
}

/**
 * Detecta si el login es sospechoso comparando IP / user-agent
 * con los últimos logins exitosos guardados en Cassandra.
 */
async function isSuspiciousLogin(cassandra, userId, ip, userAgent) {
  const result = await cassandra.execute(
    `SELECT ip_address, device_info FROM session_log
     WHERE user_id = ? AND event_type = 'LOGIN_SUCCESS'
     ORDER BY timestamp DESC LIMIT 5`,
    [userId],
    { prepare: true }
  );
  if (result.rowLength === 0) return false;
  const knownIps = result.rows.map((r) => r.ip_address);
  return !knownIps.includes(ip);
}

/**
 * HU-2: Inicio de sesión
 * HU-3: Bloqueo tras 5 intentos fallidos
 * HU-4: Detección de actividad sospechosa
 *
 * - MongoDB: lectura/escritura de datos del usuario (intentos, bloqueo)
 * - Redis: almacenamiento de sesión activa
 * - Cassandra: log de sesión y auditoría de intentos
 */
async function login({ username, password, ip, userAgent, rememberMe = false }) {
  const mongo = await getMongoDB();
  const cassandra = getCassandraClient();
  const redis = getRedisClient();

  const user = await mongo.collection("users").findOne({ username });

  // Usuario no existe → mensaje genérico (HU-2)
  if (!user) {
    return { success: false, message: "Credenciales inválidas." };
  }

  // Cuenta bloqueada (HU-3)
  if (user.isBlocked && user.blockedUntil && new Date() < new Date(user.blockedUntil)) {
    return { success: false, message: "Cuenta bloqueada temporalmente. Intente más tarde." };
  }

  // Desbloqueo automático si ya pasó el tiempo
  if (user.isBlocked && user.blockedUntil && new Date() >= new Date(user.blockedUntil)) {
    await mongo.collection("users").updateOne(
      { _id: user._id },
      { $set: { isBlocked: false, blockedUntil: null, failedLoginAttempts: 0 } }
    );
    user.isBlocked = false;
    user.failedLoginAttempts = 0;
  }

  const hashedInput = hashPassword(password, user.salt);
  const isPasswordCorrect = hashedInput === user.password;

  if (!isPasswordCorrect) {
    const newAttempts = (user.failedLoginAttempts || 0) + 1;
    const shouldBlock = newAttempts >= MAX_FAILED_ATTEMPTS;

    // ─── MongoDB: incrementar intentos fallidos ──────────────────────────
    await mongo.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          failedLoginAttempts: newAttempts,
          isBlocked: shouldBlock,
          blockedUntil: shouldBlock
            ? new Date(Date.now() + BLOCK_DURATION_SECONDS * 1000)
            : null,
          updatedAt: new Date(),
        },
      }
    );

    // ─── Cassandra: log del intento fallido ─────────────────────────────
    await cassandra.execute(
      `INSERT INTO session_log (
        event_id, user_id, username, event_type,
        timestamp, ip_address, device_info, details
      ) VALUES (uuid(), ?, ?, 'LOGIN_FAILED', toTimestamp(now()), ?, ?, ?)`,
      [
        user._id,
        username,
        ip,
        userAgent,
        JSON.stringify({ attempts: newAttempts, blocked: shouldBlock }),
      ],
      { prepare: true }
    );

    if (shouldBlock) {
      // Aquí se dispararía envío de correo (HU-3)
      console.log(`[MAIL] Cuenta ${username} bloqueada. Notificar a usuario.`);
    }

    return { success: false, message: "Credenciales inválidas." };
  }

  // ─── Credenciales correctas ──────────────────────────────────────────────
  // Restablecer intentos fallidos en MongoDB
  await mongo.collection("users").updateOne(
    { _id: user._id },
    {
      $set: {
        failedLoginAttempts: 0,
        isBlocked: false,
        blockedUntil: null,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  // ─── Detección de actividad sospechosa (HU-4) ───────────────────────────
  const suspicious = await isSuspiciousLogin(cassandra, user._id, ip, userAgent);
  if (suspicious) {
    await cassandra.execute(
      `INSERT INTO audit_log (
        event_id, event_type, user_id, username,
        timestamp, details, ip_address
      ) VALUES (uuid(), 'SUSPICIOUS_LOGIN', ?, ?, toTimestamp(now()), ?, ?)`,
      [user._id, username, JSON.stringify({ userAgent }), ip],
      { prepare: true }
    );
    // Aquí se dispararía envío de correo de alerta (HU-4)
    console.log(`[MAIL] Actividad sospechosa detectada para ${username} desde ${ip}`);
  }

  // ─── Redis: crear sesión ─────────────────────────────────────────────────
  const sessionToken = generateSessionToken();
  const sessionTTL = rememberMe ? SESSION_TTL_SECONDS * 30 : SESSION_TTL_SECONDS;
  const sessionData = {
    userId: user._id,
    username: user.username,
    fullName: user.fullName,
    createdAt: Date.now(),
    ip,
    userAgent,
    suspicious,
  };
  await redis.set(`session:${sessionToken}`, JSON.stringify(sessionData), { EX: sessionTTL });
  // Índice inverso para invalidar todas las sesiones de un usuario
  await redis.sAdd(`user_sessions:${user._id}`, sessionToken);
  await redis.expire(`user_sessions:${user._id}`, sessionTTL);

  // ─── Cassandra: log del login exitoso ───────────────────────────────────
  await cassandra.execute(
    `INSERT INTO session_log (
      event_id, user_id, username, event_type,
      timestamp, ip_address, device_info, details
    ) VALUES (uuid(), ?, ?, 'LOGIN_SUCCESS', toTimestamp(now()), ?, ?, ?)`,
    [user._id, username, ip, userAgent, JSON.stringify({ sessionToken, suspicious })],
    { prepare: true }
  );

  return {
    success: true,
    sessionToken,
    rememberMe,
    suspicious,
    user: { userId: user._id, username: user.username, fullName: user.fullName },
  };
}

module.exports = { login };