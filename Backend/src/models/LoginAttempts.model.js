const { getClient } = require('../../config/redis');

// Ventana deslizante: 15 minutos desde el último intento fallido
const ATTEMPTS_TTL = parseInt(process.env.LOGIN_ATTEMPTS_TTL_SECONDS) || 15 * 60;
// Umbral antes del bloqueo total: 5 intentos (HU-03)
const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
// Umbral de actividad sospechosa antes del bloqueo (HU-04): 3+ fallos seguidos
const SUSPICIOUS_THRESHOLD = parseInt(process.env.SUSPICIOUS_THRESHOLD) || 3;

const KEY = (userId) => `attempts:${userId}`;

/**
 * Incrementa el contador de intentos fallidos (HU-02 → HU-03).
 * Renueva el TTL en cada fallo (ventana deslizante).
 * @param {string} userId
 * @param {string} ip
 * @returns {Promise<{ attempts: number, shouldBlock: boolean, suspicious: boolean }>}
 */
const registerFailedAttempt = async (userId, ip = 'unknown') => {
  const client = getClient();
  const key    = KEY(userId);
  const raw    = await client.get(key);

  let data = raw ? JSON.parse(raw) : { attempts: 0, last_attempt: null, ip_ultimo: null };

  data.attempts++;
  data.last_attempt = Date.now();
  data.ip_ultimo    = ip;

  // Guarda y renueva TTL con cada fallo
  await client.setEx(key, ATTEMPTS_TTL, JSON.stringify(data));

  return {
    attempts:    data.attempts,
    shouldBlock: data.attempts >= MAX_ATTEMPTS,
    suspicious:  data.attempts >= SUSPICIOUS_THRESHOLD && data.attempts < MAX_ATTEMPTS,
  };
};

/**
 * Devuelve el número actual de intentos fallidos.
 * @param {string} userId
 * @returns {Promise<number>}
 */
const getAttempts = async (userId) => {
  const client = getClient();
  const raw    = await client.get(KEY(userId));
  if (!raw) return 0;
  return JSON.parse(raw).attempts;
};

/**
 * Resetea el contador al autenticar correctamente (HU-02).
 * @param {string} userId
 */
const resetAttempts = async (userId) => {
  const client = getClient();
  await client.del(KEY(userId));
};

module.exports = { registerFailedAttempt, getAttempts, resetAttempts, MAX_ATTEMPTS, SUSPICIOUS_THRESHOLD };