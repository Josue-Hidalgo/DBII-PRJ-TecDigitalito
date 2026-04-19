const { getClient } = require('../../config/redis');

// Ventana deslizante desde el último intento fallido (HU-03)
const ATTEMPTS_TTL      = parseInt(process.env.LOGIN_ATTEMPTS_TTL_SECONDS) || 15 * 60; // 15 min
// Umbral de bloqueo total (HU-03): 5 intentos
const MAX_ATTEMPTS      = parseInt(process.env.MAX_LOGIN_ATTEMPTS)          || 5;
// Umbral de actividad sospechosa (HU-04): 3 intentos
const SUSPICIOUS_THRESHOLD = parseInt(process.env.SUSPICIOUS_THRESHOLD)    || 3;

const KEY = (userId) => `attempts:${userId}`;

/**
 * Registra un intento de login fallido (HU-02 → HU-03 → HU-04).
 *
 * Flujo:
 *  1. Incrementa el contador y renueva el TTL (ventana deslizante).
 *  2. Si attempts >= MAX_ATTEMPTS   → shouldBlock = true  (HU-03)
 *  3. Si attempts >= SUSPICIOUS_THRESHOLD y < MAX → suspicious = true (HU-04)
 *
 * El caller es responsable de:
 *  - Crear el bloqueo en UserBlocks si shouldBlock = true
 *  - Encolar notificación en NotificationQueue si shouldBlock o suspicious
 *  - Registrar el intento en Cassandra (login_attempts_by_user)
 *
 * @param {string} userId
 * @param {string} ip
 * @returns {Promise<{ attempts: number, shouldBlock: boolean, suspicious: boolean }>}
 */
const registerFailedAttempt = async (userId, ip = 'unknown') => {
  const client = getClient();
  const key    = KEY(userId);
  const raw    = await client.get(key);

  let data = raw
    ? JSON.parse(raw)
    : { attempts: 0, last_attempt: null, ip_ultimo: null };

  data.attempts++;
  data.last_attempt = Date.now();
  data.ip_ultimo    = ip;

  // Ventana deslizante: TTL se renueva en cada fallo
  await client.setEx(key, ATTEMPTS_TTL, JSON.stringify(data));

  return {
    attempts:    data.attempts,
    shouldBlock: data.attempts >= MAX_ATTEMPTS,
    suspicious:  data.attempts >= SUSPICIOUS_THRESHOLD && data.attempts < MAX_ATTEMPTS,
  };
};

/**
 * Devuelve el estado actual de intentos fallidos.
 *
 * @param {string} userId
 * @returns {Promise<{ attempts: number, last_attempt: number|null, ip_ultimo: string|null }>}
 */
const getAttempts = async (userId) => {
  const client = getClient();
  const raw    = await client.get(KEY(userId));
  if (!raw) return { attempts: 0, last_attempt: null, ip_ultimo: null };
  return JSON.parse(raw);
};

/**
 * Resetea el contador al autenticar correctamente (HU-02).
 * También se llama después de un reset de contraseña exitoso (HU-07).
 *
 * @param {string} userId
 */
const resetAttempts = async (userId) => {
  const client = getClient();
  await client.del(KEY(userId));
};

module.exports = {
  registerFailedAttempt,
  getAttempts,
  resetAttempts,
  MAX_ATTEMPTS,
  SUSPICIOUS_THRESHOLD,
  ATTEMPTS_TTL,
};
