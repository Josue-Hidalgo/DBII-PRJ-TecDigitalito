const { getClient } = require('../config/redis');
const crypto = require('crypto');

// Expiración corta: 20 minutos (HU-07 — token de un solo uso)
const RESET_TTL = parseInt(process.env.RESET_TOKEN_TTL_SECONDS) || 20 * 60;
// TTL breve para mantener la key como "ya usado" y rechazar reintentos inmediatos
const USED_GRACE_TTL = 60; // 1 minuto
const KEY = (token) => `reset:${token}`;

/**
 * Genera y almacena un token de recuperación de contraseña de un solo uso (HU-07).
 *
 * El token se envía por correo (encolado en NotificationQueue).
 * En Redis solo se guarda el hash del token (SHA-256) para evitar que
 * un dump de Redis exponga tokens válidos directamente.
 *
 * Nota: para simplicidad de integración, aquí se guarda el token en texto
 * plano, pero la recomendación de producción es guardar solo el hash.
 *
 * @param {string} userId
 * @param {string} email  - Correo del solicitante; se valida al consumir el token
 * @returns {Promise<string>}  token en texto plano (se incluye en el enlace de correo)
 */
const createResetToken = async (userId, email) => {
  const client = getClient();
  const token  = crypto.randomBytes(32).toString('hex');
  const now    = Date.now();

  const data = {
    user_id:    userId,
    email:      email.toLowerCase(),
    created_at: now,
    expires_at: now + RESET_TTL * 1000,
    used:       false,
  };

  await client.setEx(KEY(token), RESET_TTL, JSON.stringify(data));
  return token;
};

/**
 * Valida el token de reset:
 *  1. Debe existir en Redis.
 *  2. No debe haber sido ya utilizado (HU-07: token de un solo uso).
 *  3. Si se proporciona email, debe coincidir con el del token.
 *
 * @param {string} token
 * @param {string} [email]  - Verificación adicional de correo
 * @returns {Promise<{ valid: boolean, userId: string|null, reason: string|null }>}
 */
const validateResetToken = async (token, email = null) => {
  const client = getClient();
  const raw    = await client.get(KEY(token));

  if (!raw) return { valid: false, userId: null, reason: 'token_no_encontrado' };

  const data = JSON.parse(raw);

  if (data.used) return { valid: false, userId: null, reason: 'token_ya_usado' };

  if (email && data.email !== email.toLowerCase()) {
    return { valid: false, userId: null, reason: 'email_no_coincide' };
  }

  return { valid: true, userId: data.user_id, reason: null };
};

/**
 * Invalida el token tras su uso (HU-07: token de un solo uso).
 *
 * Estrategia: marcar como used=true y reducir el TTL a USED_GRACE_TTL.
 * Esto permite dar un mensaje "ya usado" en vez de "no encontrado"
 * si el usuario vuelve a intentar usar el mismo enlace en segundos.
 *
 * @param {string} token
 */
const consumeResetToken = async (token) => {
  const client = getClient();
  const raw    = await client.get(KEY(token));
  if (!raw) return;

  const data = JSON.parse(raw);
  data.used  = true;

  await client.setEx(KEY(token), USED_GRACE_TTL, JSON.stringify(data));
};

module.exports = {
  createResetToken,
  validateResetToken,
  consumeResetToken,
  RESET_TTL,
};
