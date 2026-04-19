const { getClient } = require('../../config/redis');
const crypto = require('crypto');

// Expiración corta: 20 minutos (HU-07)
const RESET_TTL = parseInt(process.env.RESET_TOKEN_TTL_SECONDS) || 20 * 60;
const KEY = (token) => `reset:${token}`;

/**
 * Genera y almacena un token de recuperación de contraseña de un solo uso (HU-07).
 * @param {string} userId
 * @param {string} email   - Para verificar que el token corresponde al correo solicitante
 * @returns {Promise<string>}  token generado (se envía en el correo)
 */
const createResetToken = async (userId, email) => {
  const client = getClient();
  const token  = crypto.randomBytes(32).toString('hex');
  const now    = Date.now();
  const data   = {
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
 * Valida el token: debe existir, no estar usado y corresponder al email (HU-07).
 * @param {string} token
 * @param {string} [email]  - Si se proporciona, verifica que coincida
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
 * Marca used=true y elimina la key; dejar expirar también es válido.
 * @param {string} token
 */
const consumeResetToken = async (token) => {
  const client = getClient();
  const raw    = await client.get(KEY(token));
  if (!raw) return;
  const data   = JSON.parse(raw);
  data.used    = true;
  // Guarda brevemente con TTL corto para el caso en que alguien reintente
  // con el mismo token en la misma ventana (da respuesta "ya usado" en vez de "no encontrado")
  await client.setEx(KEY(token), 60, JSON.stringify(data));
};

module.exports = { createResetToken, validateResetToken, consumeResetToken, RESET_TTL };