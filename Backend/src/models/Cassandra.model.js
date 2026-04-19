/**
 * Cassandra.model.js
 *
 * Funciones de acceso a Cassandra para:
 *  - Intentos de login (HU-02, HU-03, HU-04, HU-10)
 *  - Actividad de sesiones (HU-05, HU-10)
 *  - Eventos de seguridad / actividad sospechosa (HU-04)
 *  - Audit trail completo (Punto Extra)
 *
 * Regla general: ninguna función de este módulo debe lanzar un error que
 * bloquee el flujo principal. Cada función captura sus propios errores y los
 * loguea en consola. Las operaciones de negocio críticas NO dependen de que
 * Cassandra responda con éxito.
 */

const { getClient } = require('../../config/cassandra');

// ─────────────────────────────────────────────────────────────────────────────
// Inicialización del keyspace y tablas
// ─────────────────────────────────────────────────────────────────────────────

const KEYSPACE = process.env.CASSANDRA_KEYSPACE || 'tec_digitalito';

/**
 * Crea el keyspace y todas las tablas si no existen.
 * Se llama una vez desde connectCassandra() al arrancar el servidor.
 */
const initSchema = async () => {
  const client = getClient();

  // Keyspace con replicación simple (ajustar factor según entorno)
  await client.execute(`
    CREATE KEYSPACE IF NOT EXISTS ${KEYSPACE}
    WITH replication = { 'class': 'SimpleStrategy', 'replication_factor': '3' }
  `);

  // Usar el keyspace
  await client.execute(`USE ${KEYSPACE}`);

  const tables = [
    // HU-02 / HU-03 / HU-04 / HU-10: intentos de login por usuario
    `CREATE TABLE IF NOT EXISTS login_attempts_by_user (
      user_id     text,
      timestamp   timestamp,
      ip          text,
      user_agent  text,
      success     boolean,
      reason      text,
      PRIMARY KEY (user_id, timestamp)
    ) WITH CLUSTERING ORDER BY (timestamp DESC)`,

    // HU-04 / HU-10: intentos de login por IP (detección fuerza bruta)
    `CREATE TABLE IF NOT EXISTS login_attempts_by_ip (
      ip          text,
      timestamp   timestamp,
      user_id     text,
      user_agent  text,
      success     boolean,
      PRIMARY KEY (ip, timestamp)
    ) WITH CLUSTERING ORDER BY (timestamp DESC)`,

    // HU-04: actividad sospechosa por usuario
    `CREATE TABLE IF NOT EXISTS suspicious_activity_by_user (
      user_id     text,
      timestamp   timestamp,
      tipo        text,
      descripcion text,
      ip          text,
      user_agent  text,
      notificado  boolean,
      PRIMARY KEY (user_id, timestamp)
    ) WITH CLUSTERING ORDER BY (timestamp DESC)`,

    // HU-05 / HU-10: historial de sesiones (login, logout, expiración)
    `CREATE TABLE IF NOT EXISTS session_activity_by_user (
      user_id    text,
      session_id text,
      action     text,
      timestamp  timestamp,
      ip         text,
      user_agent text,
      PRIMARY KEY (user_id, session_id, timestamp)
    )`,

    // HU-04 / HU-03: eventos de seguridad globales (bloqueos, resets, etc.)
    `CREATE TABLE IF NOT EXISTS security_events (
      event_type text,
      timestamp  timestamp,
      event_id   uuid,
      user_id    text,
      ip         text,
      details    text,
      PRIMARY KEY (event_type, timestamp, event_id)
    ) WITH CLUSTERING ORDER BY (timestamp DESC)`,

    // Punto Extra: audit trail completo de todas las operaciones
    `CREATE TABLE IF NOT EXISTS audit_trail (
      table_name  text,
      record_id   text,
      timestamp   timestamp,
      operation   text,
      user_id     text,
      old_values  map<text, text>,
      new_values  map<text, text>,
      ip          text,
      PRIMARY KEY (table_name, record_id, timestamp)
    ) WITH CLUSTERING ORDER BY (timestamp DESC)`,

    // Punto Extra: audit global por fecha (vista admin)
    `CREATE TABLE IF NOT EXISTS audit_trail_by_date (
      fecha      date,
      timestamp  timestamp,
      event_id   uuid,
      table_name text,
      record_id  text,
      operation  text,
      user_id    text,
      ip         text,
      PRIMARY KEY (fecha, timestamp, event_id)
    ) WITH CLUSTERING ORDER BY (timestamp DESC)`,
  ];

  for (const ddl of tables) {
    await client.execute(ddl);
  }

  console.log('Cassandra: schema inicializado');
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

/** Garantiza que el cliente esté usando el keyspace correcto. */
const useKs = (query) => `${query}`; // Las queries ya incluyen el keyspace si se configuró en client

/** Ejecuta una query con prepared statement; captura errores sin bloquear. */
const safeExecute = async (query, params, options = {}) => {
  try {
    const client = getClient();
    return await client.execute(query, params, { prepare: true, ...options });
  } catch (err) {
    console.error('[Cassandra] Error ejecutando query:', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-02 / HU-03 / HU-04 / HU-10 — Intentos de login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra un intento de login (exitoso o fallido) en Cassandra.
 * Se escribe en dos tablas (por usuario y por IP) en un batch lógico.
 *
 * @param {object} params
 * @param {string} params.userId      - ID del usuario ('unknown' si no se encontró)
 * @param {string} params.ip
 * @param {string} params.userAgent
 * @param {boolean} params.success
 * @param {string} [params.reason]    - 'success' | 'invalid_credentials' | 'account_blocked'
 */
const logLoginAttempt = async ({ userId, ip, userAgent, success, reason = null }) => {
  const ts = new Date();

  // Tabla por usuario
  safeExecute(
    `INSERT INTO ${KEYSPACE}.login_attempts_by_user
       (user_id, timestamp, ip, user_agent, success, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId || 'unknown', ts, ip || 'unknown', userAgent || 'unknown', success, reason]
  );

  // Tabla por IP (en paralelo, sin await para no bloquear)
  safeExecute(
    `INSERT INTO ${KEYSPACE}.login_attempts_by_ip
       (ip, timestamp, user_id, user_agent, success)
     VALUES (?, ?, ?, ?, ?)`,
    [ip || 'unknown', ts, userId || 'unknown', userAgent || 'unknown', success]
  );
};

/**
 * Devuelve los intentos de login de un usuario (panel admin / HU-10).
 *
 * @param {string} userId
 * @param {number} [limit=50]
 */
const getLoginAttemptsByUser = async (userId, limit = 50) => {
  const result = await safeExecute(
    `SELECT * FROM ${KEYSPACE}.login_attempts_by_user
     WHERE user_id = ?
     LIMIT ?`,
    [userId, limit]
  );
  return result ? result.rows : [];
};

/**
 * Devuelve los intentos de login desde una IP (detección fuerza bruta / HU-04).
 *
 * @param {string} ip
 * @param {number} [limit=50]
 */
const getLoginAttemptsByIp = async (ip, limit = 50) => {
  const result = await safeExecute(
    `SELECT * FROM ${KEYSPACE}.login_attempts_by_ip
     WHERE ip = ?
     LIMIT ?`,
    [ip, limit]
  );
  return result ? result.rows : [];
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-05 / HU-10 — Actividad de sesiones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra un evento de sesión: login, logout, expiración o remember_me.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.sessionId
 * @param {'login'|'logout'|'expire'|'remember_me'} params.action
 * @param {string} params.ip
 * @param {string} params.userAgent
 */
const logSessionActivity = async ({ userId, sessionId, action, ip, userAgent }) => {
  safeExecute(
    `INSERT INTO ${KEYSPACE}.session_activity_by_user
       (user_id, session_id, action, timestamp, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, sessionId || 'unknown', action, new Date(), ip || 'unknown', userAgent || 'unknown']
  );
};

/**
 * Devuelve el historial de sesiones de un usuario (HU-10).
 *
 * @param {string} userId
 * @param {number} [limit=100]
 */
const getSessionActivityByUser = async (userId, limit = 100) => {
  const result = await safeExecute(
    `SELECT * FROM ${KEYSPACE}.session_activity_by_user
     WHERE user_id = ?
     LIMIT ?`,
    [userId, limit]
  );
  return result ? result.rows : [];
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-04 — Actividad sospechosa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra un evento de actividad sospechosa para un usuario (HU-04).
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {'login_nueva_ip'|'multiples_fallos'|'fuerza_bruta_ip'|'sesion_concurrente'} params.tipo
 * @param {string} params.descripcion
 * @param {string} params.ip
 * @param {string} params.userAgent
 * @param {boolean} [params.notificado=false]
 */
const logSuspiciousActivity = async ({
  userId, tipo, descripcion, ip, userAgent, notificado = false,
}) => {
  safeExecute(
    `INSERT INTO ${KEYSPACE}.suspicious_activity_by_user
       (user_id, timestamp, tipo, descripcion, ip, user_agent, notificado)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, new Date(), tipo, descripcion || '', ip || 'unknown', userAgent || 'unknown', notificado]
  );
};

/**
 * Devuelve el historial de actividad sospechosa de un usuario (HU-04 / HU-10).
 *
 * @param {string} userId
 * @param {number} [limit=50]
 */
const getSuspiciousActivityByUser = async (userId, limit = 50) => {
  const result = await safeExecute(
    `SELECT * FROM ${KEYSPACE}.suspicious_activity_by_user
     WHERE user_id = ?
     LIMIT ?`,
    [userId, limit]
  );
  return result ? result.rows : [];
};

// ─────────────────────────────────────────────────────────────────────────────
// HU-03 / HU-04 — Eventos de seguridad globales
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra un evento de seguridad global (bloqueo, reset, sospecha).
 *
 * @param {object} params
 * @param {'block'|'suspicious'|'password_reset'|'unblock'} params.eventType
 * @param {string} params.userId
 * @param {string} params.ip
 * @param {string} [params.details]  - JSON string con detalles adicionales
 */
const logSecurityEvent = async ({ eventType, userId, ip, details = '' }) => {
  const { types } = require('cassandra-driver');
  const eventId = types.TimeUuid.now(); // UUID v1 basado en tiempo

  safeExecute(
    `INSERT INTO ${KEYSPACE}.security_events
       (event_type, timestamp, event_id, user_id, ip, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [eventType, new Date(), eventId, userId, ip || 'unknown', details]
  );
};

/**
 * Devuelve eventos de seguridad por tipo (panel admin / HU-10).
 *
 * @param {string} eventType
 * @param {number} [limit=100]
 */
const getSecurityEvents = async (eventType, limit = 100) => {
  const result = await safeExecute(
    `SELECT * FROM ${KEYSPACE}.security_events
     WHERE event_type = ?
     LIMIT ?`,
    [eventType, limit]
  );
  return result ? result.rows : [];
};

// ─────────────────────────────────────────────────────────────────────────────
// Punto Extra — Audit trail
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra un cambio en cualquier entidad del sistema (Punto Extra: Audit).
 *
 * Se escribe en dos tablas: por entidad y por fecha (para consultas de admin).
 *
 * @param {object} params
 * @param {string} params.tableName   - 'users' | 'courses' | 'enrollments' | etc.
 * @param {string} params.recordId    - ID del registro afectado
 * @param {'CREATE'|'UPDATE'|'DELETE'} params.operation
 * @param {string} params.userId      - Quién realizó la operación
 * @param {object} [params.oldValues] - Estado anterior (para UPDATE/DELETE)
 * @param {object} [params.newValues] - Estado nuevo (para CREATE/UPDATE)
 * @param {string} [params.ip]
 */
const auditChange = async ({
  tableName, recordId, operation, userId, oldValues = {}, newValues = {}, ip = 'unknown',
}) => {
  const ts = new Date();
  const { types } = require('cassandra-driver');
  const eventId = types.TimeUuid.now();

  // Convertir objetos a map<text,text> (Cassandra solo acepta strings en el map)
  const toStringMap = (obj) => {
    const result = {};
    for (const [k, v] of Object.entries(obj || {})) {
      result[k] = v !== null && v !== undefined ? String(v) : '';
    }
    return result;
  };

  const oldMap = toStringMap(oldValues);
  const newMap = toStringMap(newValues);

  // Tabla por entidad
  safeExecute(
    `INSERT INTO ${KEYSPACE}.audit_trail
       (table_name, record_id, timestamp, operation, user_id, old_values, new_values, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tableName, recordId, ts, operation, userId || 'system', oldMap, newMap, ip]
  );

  // Tabla por fecha (vista global admin)
  const fecha = ts.toISOString().split('T')[0]; // 'YYYY-MM-DD'
  safeExecute(
    `INSERT INTO ${KEYSPACE}.audit_trail_by_date
       (fecha, timestamp, event_id, table_name, record_id, operation, user_id, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [fecha, ts, eventId, tableName, recordId, operation, userId || 'system', ip]
  );
};

/**
 * Devuelve el audit trail de una entidad específica.
 *
 * @param {string} tableName
 * @param {string} recordId
 * @param {number} [limit=50]
 */
const getAuditTrail = async (tableName, recordId, limit = 50) => {
  const result = await safeExecute(
    `SELECT * FROM ${KEYSPACE}.audit_trail
     WHERE table_name = ? AND record_id = ?
     LIMIT ?`,
    [tableName, recordId, limit]
  );
  return result ? result.rows : [];
};

/**
 * Devuelve el audit trail global de una fecha (YYYY-MM-DD).
 *
 * @param {string} fecha  - 'YYYY-MM-DD'
 * @param {number} [limit=200]
 */
const getAuditTrailByDate = async (fecha, limit = 200) => {
  const result = await safeExecute(
    `SELECT * FROM ${KEYSPACE}.audit_trail_by_date
     WHERE fecha = ?
     LIMIT ?`,
    [fecha, limit]
  );
  return result ? result.rows : [];
};

/**
 * Devuelve un resumen de actividad de un usuario (logs de login + sesiones).
 * Usada por el panel de admin (HU-10).
 *
 * @param {string} userId
 */
const getUserActivityLog = async (userId) => {
  const [loginAttempts, sessionActivity, suspiciousActivity] = await Promise.all([
    getLoginAttemptsByUser(userId, 100),
    getSessionActivityByUser(userId, 100),
    getSuspiciousActivityByUser(userId, 50),
  ]);

  return { loginAttempts, sessionActivity, suspiciousActivity };
};

module.exports = {
  // Inicialización
  initSchema,
  // Login
  logLoginAttempt,
  getLoginAttemptsByUser,
  getLoginAttemptsByIp,
  // Sesiones
  logSessionActivity,
  getSessionActivityByUser,
  // Actividad sospechosa
  logSuspiciousActivity,
  getSuspiciousActivityByUser,
  // Seguridad
  logSecurityEvent,
  getSecurityEvents,
  // Audit (Punto Extra)
  auditChange,
  getAuditTrail,
  getAuditTrailByDate,
  // Resumen
  getUserActivityLog,
};
