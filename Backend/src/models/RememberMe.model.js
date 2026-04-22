const { getClient } = require('../config/redis');
const crypto = require('crypto');

// TTL por defecto: 30 días en segundos (HU-06)
const REMEMBER_TTL = parseInt(process.env.REMEMBER_ME_TTL_SECONDS) || 30 * 24 * 3600;
const KEY = (userId) => `remember:${userId}`;

/**
 * Genera y persiste un token "Recordarme" seguro (HU-06).
 * La cookie que se envía al navegador contiene SOLO el token;
 * el servidor valida buscando esta key por userId.
 *
 * Seguridad: token de 32 bytes aleatorios (256 bits de entropía).
 * La cookie debe enviarse con httpOnly + Secure + sameSite=strict.
 *
 * @param {string} userId
 * @param {object} ctx   - { ip, user_agent }
 * @returns {Promise<string>}  token generado (va en la cookie)
 */
const createRememberToken = async (userId, ctx = {}) => {
  const client = getClient();
  const token  = crypto.randomBytes(32).toString('hex');
  const now    = Date.now();

  const data = {
    token,
    ip_origen:         ctx.ip         || 'unknown',
    user_agent_origen: ctx.user_agent || 'unknown',
    created_at:        now,
    expires_at:        now + REMEMBER_TTL * 1000,
  };

  await client.setEx(KEY(userId), REMEMBER_TTL, JSON.stringify(data));
  return token;
};

/**
 * Valida el token remember_me para el userId dado.
 *
 * Si el user_agent difiere del original → actividad sospechosa (HU-04):
 * el caller debe encolar notificación e invalidar el token.
 *
 * @param {string} userId
 * @param {string} token           - Valor extraído de la cookie
 * @param {string} currentUserAgent
 * @returns {Promise<{ valid: boolean, suspicious: boolean }>}
 */
const validateRememberToken = async (userId, token, currentUserAgent = '') => {
  const client = getClient();
  const raw    = await client.get(KEY(userId));
  if (!raw) return { valid: false, suspicious: false };

  const stored = JSON.parse(raw);

  if (stored.token !== token) return { valid: false, suspicious: false };

  // Detectar cambio de user-agent (HU-04)
  const suspicious =
    currentUserAgent !== '' &&
    stored.user_agent_origen !== '' &&
    currentUserAgent !== stored.user_agent_origen;

  return { valid: true, suspicious };
};

/**
 * Invalida el token remember_me:
 * - Cierre de sesión manual (HU-05)
 * - Actividad sospechosa detectada (HU-04)
 * - Cambio de contraseña (HU-08)
 *
 * @param {string} userId
 */
const deleteRememberToken = async (userId) => {
  const client = getClient();
  await client.del(KEY(userId));
};

module.exports = {
  createRememberToken,
  validateRememberToken,
  deleteRememberToken,
  REMEMBER_TTL,
};
