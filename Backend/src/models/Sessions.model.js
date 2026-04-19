const { getClient } = require('../config/redis');

// TTL por defecto: 2 horas en segundos (sliding window, HU-06)
const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS) || 7200;
const KEY = (sessionId) => `session:${sessionId}`;
const INDEX_KEY = (userId) => `user_sessions:${userId}`;

/**
 * Crea una sesión nueva en Redis al autenticar correctamente (HU-02).
 * También indexa el sessionId bajo user_sessions:{userId} para poder
 * invalidar todas las sesiones de un usuario en O(n) sin SCAN (HU-05 / HU-08).
 *
 * @param {string} sessionId  - Token opaco generado en Auth (crypto.randomBytes)
 * @param {object} payload    - { user_id, ip, dispositivo, user_agent }
 */
const createSession = async (sessionId, payload) => {
  const client = getClient();
  const now = Date.now();

  const data = {
    user_id:     payload.user_id,
    token:       sessionId,
    ip:          payload.ip          || 'unknown',
    dispositivo: payload.dispositivo || 'unknown',
    user_agent:  payload.user_agent  || 'unknown',
    created_at:  now,
    expires_at:  now + SESSION_TTL * 1000,
  };

  // Guardar sesión
  await client.setEx(KEY(sessionId), SESSION_TTL, JSON.stringify(data));

  // Índice secundario: Set de sessionIds por usuario (TTL un poco mayor que la sesión)
  await client.sAdd(INDEX_KEY(payload.user_id), sessionId);
  await client.expire(INDEX_KEY(payload.user_id), SESSION_TTL + 60);
};

/**
 * Obtiene los datos de una sesión activa.
 * Implementa sliding window: renueva el TTL en cada acceso (HU-06).
 *
 * @param {string} sessionId
 * @returns {Promise<object|null>}  null si no existe o expiró
 */
const getSession = async (sessionId) => {
  const client = getClient();
  const raw = await client.get(KEY(sessionId));
  if (!raw) return null;

  const session = JSON.parse(raw);

  // Sliding window: renova TTL en cada petición autenticada
  await client.expire(KEY(sessionId), SESSION_TTL);

  return session;
};

/**
 * Elimina una sesión — cierre de sesión manual (HU-05).
 * El token queda inválido de inmediato, sin esperar el TTL.
 *
 * @param {string} sessionId
 * @param {string} [userId]  - Si se proporciona, limpia también del índice secundario
 */
const deleteSession = async (sessionId, userId = null) => {
  const client = getClient();
  await client.del(KEY(sessionId));

  if (userId) {
    await client.sRem(INDEX_KEY(userId), sessionId);
  }
};

/**
 * Elimina TODAS las sesiones de un usuario (HU-05 / HU-08 / HU-04).
 * Usa el índice secundario user_sessions:{userId} para evitar SCAN global.
 *
 * @param {string} userId
 */
const deleteAllUserSessions = async (userId) => {
  const client = getClient();

  const sessionIds = await client.sMembers(INDEX_KEY(userId));

  if (sessionIds.length > 0) {
    const pipeline = client.multi();
    for (const sid of sessionIds) {
      pipeline.del(KEY(sid));
    }
    pipeline.del(INDEX_KEY(userId));
    await pipeline.exec();
  }
};

/**
 * Lista todas las sesiones activas de un usuario (panel admin / HU-10).
 *
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
const getUserSessions = async (userId) => {
  const client = getClient();
  const sessionIds = await client.sMembers(INDEX_KEY(userId));

  const sessions = [];
  for (const sid of sessionIds) {
    const raw = await client.get(KEY(sid));
    if (raw) sessions.push(JSON.parse(raw));
    else await client.sRem(INDEX_KEY(userId), sid); // limpiar stale refs
  }

  return sessions;
};

module.exports = {
  createSession,
  getSession,
  deleteSession,
  deleteAllUserSessions,
  getUserSessions,
  SESSION_TTL,
};
