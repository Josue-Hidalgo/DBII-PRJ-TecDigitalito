const { getClient } = require('../../config/redis');

// TTL por defecto: 2 horas en segundos
const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS) || 7200;
const KEY = (sessionId) => `session:${sessionId}`;

/**
 * Crea una sesión nueva en Redis al autenticar correctamente (HU-02).
 * @param {string} sessionId  - Token / ID de sesión generado en la capa de auth
 * @param {object} payload    - { user_id, ip, dispositivo, user_agent }
 * @returns {Promise<void>}
 */
const createSession = async (sessionId, payload) => {
  const client = getClient();
  const now = Date.now();
  const data = {
    user_id:    payload.user_id,
    token:      sessionId,
    ip:         payload.ip         || 'unknown',
    dispositivo: payload.dispositivo || 'unknown',
    user_agent: payload.user_agent || 'unknown',
    created_at: now,
    expires_at: now + SESSION_TTL * 1000,
  };
  await client.setEx(KEY(sessionId), SESSION_TTL, JSON.stringify(data));
};

/**
 * Obtiene los datos de una sesión activa.
 * Renueva el TTL (sliding window) si la sesión existe.
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
const getSession = async (sessionId) => {
  const client = getClient();
  const raw = await client.get(KEY(sessionId));
  if (!raw) return null;
  // Sliding window: renueva TTL en cada acceso (HU-06)
  await client.expire(KEY(sessionId), SESSION_TTL);
  return JSON.parse(raw);
};

/**
 * Elimina una sesión — cierre de sesión manual (HU-05).
 * El token queda inválido inmediatamente, sin esperar al TTL.
 * @param {string} sessionId
 */
const deleteSession = async (sessionId) => {
  const client = getClient();
  await client.del(KEY(sessionId));
};

/**
 * Elimina todas las sesiones de un usuario.
 * Se usa al detectar actividad sospechosa o al cambiar contraseña (HU-04 / HU-08).
 * SCAN es O(n) pero aceptable; en producción considerar índice secundario.
 * @param {string} userId
 */
const deleteAllUserSessions = async (userId) => {
  const client = getClient();
  let cursor = 0;
  do {
    const result = await client.scan(cursor, { MATCH: 'session:*', COUNT: 100 });
    cursor = result.cursor;
    for (const key of result.keys) {
      const raw = await client.get(key);
      if (!raw) continue;
      const session = JSON.parse(raw);
      if (session.user_id === userId) {
        await client.del(key);
      }
    }
  } while (cursor !== 0);
};

module.exports = { createSession, getSession, deleteSession, deleteAllUserSessions };