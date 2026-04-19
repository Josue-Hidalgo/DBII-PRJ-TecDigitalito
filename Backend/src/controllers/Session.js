// HU-5: Cerrar Sesión  |  HU-6: Recordarme
const { getCassandraClient } = require("../config/cassandra");
const { getRedisClient } = require("../config/redis");

/**
 * HU-5: Cerrar sesión
 * - Redis: invalida el token de sesión activo
 * - Cassandra: registra el cierre de sesión en log
 */
async function logout({ sessionToken, ip, userAgent }) {
  const redis = getRedisClient();
  const cassandra = getCassandraClient();

  // Recuperar datos de sesión antes de borrarla
  const raw = await redis.get(`session:${sessionToken}`);
  if (!raw) {
    return { success: false, message: "Sesión no encontrada o ya expirada." };
  }
  const session = JSON.parse(raw);

  // ─── Redis: eliminar sesión y referencia del índice de usuario ──────────
  await redis.del(`session:${sessionToken}`);
  await redis.sRem(`user_sessions:${session.userId}`, sessionToken);

  // ─── Cassandra: log del cierre de sesión ────────────────────────────────
  await cassandra.execute(
    `INSERT INTO session_log (
      event_id, user_id, username, event_type,
      timestamp, ip_address, device_info, details
    ) VALUES (uuid(), ?, ?, 'LOGOUT', toTimestamp(now()), ?, ?, ?)`,
    [session.userId, session.username, ip, userAgent, JSON.stringify({ sessionToken })],
    { prepare: true }
  );

  return { success: true, message: "Sesión cerrada correctamente." };
}

/**
 * HU-5: Invalida TODAS las sesiones activas de un usuario
 * Útil cuando se detecta actividad sospechosa (HU-4 / HU-6)
 */
async function invalidateAllSessions({ userId, reason = "manual" }) {
  const redis = getRedisClient();
  const cassandra = getCassandraClient();

  const tokens = await redis.sMembers(`user_sessions:${userId}`);
  if (tokens.length === 0) return { invalidated: 0 };

  // Eliminar cada token
  const pipeline = redis.multi();
  for (const token of tokens) {
    pipeline.del(`session:${token}`);
  }
  pipeline.del(`user_sessions:${userId}`);
  await pipeline.exec();

  // ─── Cassandra: una entrada de auditoría por la invalidación masiva ─────
  await cassandra.execute(
    `INSERT INTO audit_log (
      event_id, event_type, user_id, username,
      timestamp, details, ip_address
    ) VALUES (uuid(), 'ALL_SESSIONS_INVALIDATED', ?, 'N/A', toTimestamp(now()), ?, '0.0.0.0')`,
    [userId, JSON.stringify({ reason, count: tokens.length })],
    { prepare: true }
  );

  return { invalidated: tokens.length };
}

/**
 * HU-6: Verificar si una cookie "Recordarme" sigue siendo válida
 * - Redis: revisa el token y retorna los datos de sesión
 * - Si la sesión fue marcada como sospechosa, la invalida
 */
async function validateRememberMeToken(sessionToken) {
  const redis = getRedisClient();

  const raw = await redis.get(`session:${sessionToken}`);
  if (!raw) return { valid: false };

  const session = JSON.parse(raw);

  // Si en algún momento se marcó como sospechosa, invalidar (HU-6)
  if (session.suspicious) {
    await redis.del(`session:${sessionToken}`);
    await redis.sRem(`user_sessions:${session.userId}`, sessionToken);
    return { valid: false, reason: "suspicious_activity" };
  }

  return { valid: true, session };
}

/**
 * Middleware: valida que el token de sesión en el header/cookie sea válido.
 * Retorna los datos de sesión si es válido, o lanza error si no.
 */
async function requireAuth(sessionToken) {
  if (!sessionToken) throw new Error("No se proporcionó token de sesión.");
  const result = await validateRememberMeToken(sessionToken);
  if (!result.valid) throw new Error("Sesión inválida o expirada.");
  return result.session;
}

module.exports = { logout, invalidateAllSessions, validateRememberMeToken, requireAuth };