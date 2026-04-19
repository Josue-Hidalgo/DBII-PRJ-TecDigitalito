const {
  getSession,
  deleteSession,
  deleteAllUserSessions,
} = require('../models/Sessions.model');
const {
  validateRememberToken,
  deleteRememberToken,
} = require('../models/RememberMe.model');
const { enqueueNotification } = require('../models/NotificationQueue.model');

/**
 * Cierra sesión invalidando el token de sesión (HU-05).
 * También invalida el token remember_me si existe.
 *
 * @param {object} params
 * @param {string} params.sessionToken
 * @param {string} [params.ip]
 * @param {string} [params.userAgent]
 * @returns {Promise<{ message: string }>}
 */
const logout = async ({ sessionToken, ip = 'unknown', userAgent = 'unknown' }) => {
  const session = await getSession(sessionToken);

  if (session) {
    // Eliminar sesión del índice secundario también
    await deleteSession(sessionToken, session.user_id);
    // Invalidar cookie remember_me asociada (HU-05)
    await deleteRememberToken(session.user_id);
  } else {
    // Token no encontrado o ya expirado: aun así responder OK (idempotente)
    await deleteSession(sessionToken);
  }

  return { message: 'Sesión cerrada correctamente.' };
};

/**
 * Cierra TODAS las sesiones activas de un usuario (HU-05).
 * También invalida el token remember_me.
 *
 * @param {object} params
 * @param {string} params.userId
 * @returns {Promise<{ message: string }>}
 */
const invalidateAllSessions = async ({ userId }) => {
  await deleteAllUserSessions(userId);
  await deleteRememberToken(userId);
  return { message: 'Todas las sesiones han sido cerradas.' };
};

/**
 * Valida un token de sesión o de remember_me (HU-06).
 *
 * Estrategia:
 *  1. Intentar como session token directo.
 *  2. Si no existe, intentar como remember_me token buscando por userId
 *     (el cliente debe enviar también el userId en este caso, o el token
 *     puede ser un JWT que contenga el userId — aquí se recibe como parámetro).
 *
 * Nota: en una implementación completa, el token de sesión puede ser un JWT
 * firmado que contenga el userId; aquí se asume token opaco y se espera que
 * el cliente envíe userId + rememberToken cuando intenta renovar desde cookie.
 *
 * @param {string} token  - session token opaco
 * @param {object} [opts] - { userId, rememberToken, userAgent } para validación remember_me
 * @returns {Promise<{ valid: boolean, session?: object, reason?: string }>}
 */
const validateSession = async (token, opts = {}) => {
  // Intentar como session token
  const session = await getSession(token);
  if (session) return { valid: true, session };

  // Intentar como remember_me (HU-06)
  if (opts.userId && opts.rememberToken) {
    const { valid, suspicious } = await validateRememberToken(
      opts.userId,
      opts.rememberToken,
      opts.userAgent || ''
    );

    if (!valid) return { valid: false, reason: 'token_invalido' };

    // Actividad sospechosa: user-agent cambió (HU-04)
    if (suspicious) {
      await deleteRememberToken(opts.userId);
      await deleteAllUserSessions(opts.userId);
      await enqueueNotification(opts.userId, opts.email || '', 'actividad_sospechosa', {
        ip:         opts.ip        || 'unknown',
        user_agent: opts.userAgent || 'unknown',
        timestamp:  Date.now(),
      });
      return { valid: false, reason: 'actividad_sospechosa' };
    }

    return { valid: true, session: { user_id: opts.userId, via: 'remember_me' } };
  }

  return { valid: false, reason: 'sesion_no_encontrada' };
};

// Alias para el controlador existente
const validateRememberMeToken = (token) => validateSession(token);

module.exports = {
  logout,
  invalidateAllSessions,
  validateSession,
  validateRememberMeToken,
};
