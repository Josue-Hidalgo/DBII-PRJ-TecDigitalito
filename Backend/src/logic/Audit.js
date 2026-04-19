/**
 * Audit.js — Fachada de auditoría que conecta la lógica de negocio con Cassandra.
 *
 * Importa las funciones de Cassandra.model y las expone con nombres
 * coherentes con los que usan Login.js, Session.js, Register.js, etc.
 *
 * Todas las funciones son "fire and forget" seguras: capturan sus propios
 * errores para que un fallo de Cassandra nunca bloquee una operación principal.
 */

const CassandraModel = require('../models/Cassandra.model');

// ─────────────────────────────────────────────────────────────────────────────
// Wrappers con manejo de errores no bloqueante
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra un intento de login en Cassandra (HU-02, HU-03, HU-04, HU-10).
 *
 * @param {object} params
 * @param {string} params.userId      - 'unknown' si el usuario no fue hallado
 * @param {string} params.ip
 * @param {string} params.userAgent
 * @param {boolean} params.success
 * @param {string} [params.reason]    - 'success' | 'invalid_credentials' | 'account_blocked'
 */
const logLoginAttempt = async (params) => {
  try {
    await CassandraModel.logLoginAttempt(params);
  } catch (err) {
    console.error('[Audit] logLoginAttempt:', err.message);
  }
};

/**
 * Registra actividad de sesión en Cassandra (HU-05, HU-10).
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.sessionId
 * @param {'login'|'logout'|'expire'|'remember_me'} params.action
 * @param {string} params.ip
 * @param {string} params.userAgent
 */
const logSessionActivity = async (params) => {
  try {
    await CassandraModel.logSessionActivity(params);
  } catch (err) {
    console.error('[Audit] logSessionActivity:', err.message);
  }
};

/**
 * Registra actividad sospechosa en Cassandra (HU-04).
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.tipo
 * @param {string} params.descripcion
 * @param {string} params.ip
 * @param {string} params.userAgent
 * @param {boolean} [params.notificado]
 */
const logSuspiciousActivity = async (params) => {
  try {
    await CassandraModel.logSuspiciousActivity(params);
  } catch (err) {
    console.error('[Audit] logSuspiciousActivity:', err.message);
  }
};

/**
 * Registra un evento de seguridad global (HU-03, HU-04).
 *
 * @param {object} params
 * @param {'block'|'suspicious'|'password_reset'|'unblock'} params.eventType
 * @param {string} params.userId
 * @param {string} params.ip
 * @param {string} [params.details]
 */
const logSecurityEvent = async (params) => {
  try {
    await CassandraModel.logSecurityEvent(params);
  } catch (err) {
    console.error('[Audit] logSecurityEvent:', err.message);
  }
};

/**
 * Registra un cambio en cualquier entidad (Punto Extra: Audit trail).
 *
 * @param {object} params
 * @param {string} params.tableName
 * @param {string} params.recordId
 * @param {'CREATE'|'UPDATE'|'DELETE'} params.operation
 * @param {string} params.userId
 * @param {object} [params.oldValues]
 * @param {object} [params.newValues]
 * @param {string} [params.ip]
 */
const auditChange = async (params) => {
  try {
    await CassandraModel.auditChange(params);
  } catch (err) {
    console.error('[Audit] auditChange:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Consultas (para el Admin.controller)
// ─────────────────────────────────────────────────────────────────────────────

const getUserActivityLog       = (userId)           => CassandraModel.getUserActivityLog(userId);
const getSecurityEvents        = (eventType, limit) => CassandraModel.getSecurityEvents(eventType, limit);
const getAuditTrail            = (table, recordId)  => CassandraModel.getAuditTrail(table, recordId);
const getAuditTrailByDate      = (fecha, limit)     => CassandraModel.getAuditTrailByDate(fecha, limit);
const getLoginAttemptsByUser   = (userId, limit)    => CassandraModel.getLoginAttemptsByUser(userId, limit);
const getLoginAttemptsByIp     = (ip, limit)        => CassandraModel.getLoginAttemptsByIp(ip, limit);

module.exports = {
  // Escritura (no bloqueante)
  logLoginAttempt,
  logSessionActivity,
  logSuspiciousActivity,
  logSecurityEvent,
  auditChange,
  // Lectura (para admin)
  getUserActivityLog,
  getSecurityEvents,
  getAuditTrail,
  getAuditTrailByDate,
  getLoginAttemptsByUser,
  getLoginAttemptsByIp,
};
