const { getClient } = require('../../config/redis');
const crypto = require('crypto');

// TTL por defecto: 30 días en segundos
const REMEMBER_TTL = parseInt(process.env.REMEMBER_ME_TTL_SECONDS) || 30 * 24 * 3600;
const KEY = (userId) => `remember:${userId}`;

/**
 * Genera y persiste un token de "Recordarme" seguro (HU-06).
 * La cookie que se envía al navegador contiene solo el token;
 * el servidor lo valida buscando esta key por userId.
 * @param {string} userId
 * @param {object} ctx  - { ip_origen, user_agent_origen }
 * @returns {Promise<string>}  token generado
 */
const createRememberToken = async (userId, ctx = {}) => {
  const client = getClient();
  const token = crypto.randomBytes(32).toString('hex');
  const now   = Date.now();
  const data  = {
    token,
    ip_origen:          ctx.ip          || 'unknown',
    user_agent_origen:  ctx.user_agent  || 'unknown',
    created_at:         now,
    expires_at:         now + REMEMBER_TTL * 1000,
  };
  await client.setEx(KEY(userId), REMEMBER_TTL, JSON.stringify(data));
  return token;
};

/**
 * Valida un token de remember_me dado el userId.
 * Si el user_agent difiere del de creación, lo marca como sospechoso (HU-04).
 * @param {string} userId
 * @param {string} token
 * @param {string} currentUserAgent
 * @returns {Promise<{ valid: boolean, suspicious: boolean }>}
 */
const validateRememberToken = async (userId, token, currentUserAgent = '') => {
  const client = getClient();
  const raw = await client.get(KEY(userId));
  if (!raw) return { valid: false, suspicious: false };

  const stored = JSON.parse(raw);
  if (stored.token !== token) return { valid: false, suspicious: false };

  const suspicious = currentUserAgent !== '' &&
                     stored.user_agent_origen !== '' &&
                     currentUserAgent !== stored.user_agent_origen;

  return { valid: true, suspicious };
};

/**
 * Invalida el token de remember_me — cierre de sesión (HU-05)
 * o actividad sospechosa detectada (HU-04).
 * @param {string} userId
 */
const deleteRememberToken = async (userId) => {
  const client = getClient();
  await client.del(KEY(userId));
};

module.exports = { createRememberToken, validateRememberToken, deleteRememberToken };