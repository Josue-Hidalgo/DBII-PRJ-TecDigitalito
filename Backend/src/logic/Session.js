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
// ── Integración Cassandra (HU-05, HU-10) ─────────────────────────────────────
const { logSessionActivity, logSecurityEvent } = require('./Audit');

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

    // Registrar en Cassandra (HU-10)
    logSessionActivity({
      userId:    session.user_id,
      sessionId: sessionToken,
      action:    'logout',
      ip,
      userAgent,
    });
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

  // Registrar en Cassandra
  logSessionActivity({
    userId,
    sessionId: 'all',
    action:    'logout',
    ip:        'system',
    userAgent: 'system',
  });

  return { message: 'Todas las sesiones han sido cerradas.' };
};

/**
 * Valida un token de sesión o de remember_me (HU-06).
 *
 * @param {string} token  - session token opaco
 * @param {object} [opts] - { userId, rememberToken, userAgent, ip, email } para validación remember_me
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

      // Registrar en Cassandra
      logSecurityEvent({
        eventType: 'suspicious',
        userId:    opts.userId,
        ip:        opts.ip || 'unknown',
        details:   JSON.stringify({ reason: 'remember_me_user_agent_mismatch' }),
      });
      logSessionActivity({
        userId:    opts.userId,
        sessionId: 'remember_me',
        action:    'expire',
        ip:        opts.ip || 'unknown',
        userAgent: opts.userAgent || 'unknown',
      });

      return { valid: false, reason: 'actividad_sospechosa' };
    }

    // Remember me válido: registrar renovación
    logSessionActivity({
      userId:    opts.userId,
      sessionId: 'remember_me',
      action:    'remember_me',
      ip:        opts.ip || 'unknown',
      userAgent: opts.userAgent || 'unknown',
    });

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
