// HU-10: Registro de actividad (vista administrador)
const { getCassandraClient } = require("../config/cassandra");

/**
 * HU-10: Como administrador, ver registro de inicios/cierres de sesión.
 * Criterios de aceptación:
 * - Guarda IP, fecha, hora y dispositivo
 * - Registra accesos exitosos y fallidos
 *
 * Todo el log vive en Cassandra (diseñado para escrituras masivas y consultas por tiempo).
 */

/**
 * Obtiene el historial de sesiones de un usuario específico.
 * Ordenado por fecha descendente.
 */
async function getUserSessionLog({ userId, limit = 50 }) {
  const cassandra = getCassandraClient();

  const result = await cassandra.execute(
    `SELECT event_id, event_type, timestamp, ip_address, device_info, details
     FROM session_log
     WHERE user_id = ?
     ORDER BY timestamp DESC
     LIMIT ?`,
    [userId, limit],
    { prepare: true }
  );

  return result.rows.map((r) => ({
    eventId: r.event_id,
    eventType: r.event_type,
    timestamp: r.timestamp,
    ipAddress: r.ip_address,
    device: r.device_info,
    details: safeParseJSON(r.details),
  }));
}

/**
 * Obtiene todos los eventos de sesión recientes (para el panel de admin).
 * Cassandra no permite ORDER BY sin partition key, así que se pagina por fecha.
 */
async function getRecentActivityLog({ eventType = null, limit = 100, pagingState = null } = {}) {
  const cassandra = getCassandraClient();

  let query;
  let params;

  if (eventType) {
    // Vista materializada por event_type (debe existir en el schema)
    query = `SELECT event_id, user_id, username, event_type, timestamp, ip_address, device_info
             FROM session_log_by_type
             WHERE event_type = ?
             LIMIT ?`;
    params = [eventType, limit];
  } else {
    query = `SELECT event_id, user_id, username, event_type, timestamp, ip_address, device_info
             FROM session_log_by_date
             LIMIT ?`;
    params = [limit];
  }

  const options = { prepare: true };
  if (pagingState) options.pageState = pagingState;

  const result = await cassandra.execute(query, params, options);

  return {
    rows: result.rows.map((r) => ({
      eventId: r.event_id,
      userId: r.user_id,
      username: r.username,
      eventType: r.event_type,
      timestamp: r.timestamp,
      ipAddress: r.ip_address,
      device: r.device_info,
    })),
    nextPage: result.pageState || null,
  };
}

/**
 * Obtiene la auditoría general del sistema (eventos de negocio).
 * Incluye: registros, bloqueos, cambios de contraseña, etc.
 */
async function getAuditLog({ userId = null, eventType = null, limit = 100 } = {}) {
  const cassandra = getCassandraClient();
  let query;
  let params;

  if (userId) {
    query = `SELECT event_id, event_type, user_id, username, timestamp, details, ip_address
             FROM audit_log
             WHERE user_id = ?
             ORDER BY timestamp DESC
             LIMIT ?`;
    params = [userId, limit];
  } else if (eventType) {
    query = `SELECT event_id, event_type, user_id, username, timestamp, details, ip_address
             FROM audit_log_by_type
             WHERE event_type = ?
             LIMIT ?`;
    params = [eventType, limit];
  } else {
    query = `SELECT event_id, event_type, user_id, username, timestamp, details, ip_address
             FROM audit_log
             LIMIT ?`;
    params = [limit];
  }

  const result = await cassandra.execute(query, params, { prepare: true });

  return result.rows.map((r) => ({
    eventId: r.event_id,
    eventType: r.event_type,
    userId: r.user_id,
    username: r.username,
    timestamp: r.timestamp,
    details: safeParseJSON(r.details),
    ipAddress: r.ip_address,
  }));
}

/**
 * Estadísticas rápidas de acceso (para dashboard de admin).
 * Usa Redis para contadores en tiempo real (complemento a Cassandra).
 */
async function getLoginStats({ userId }) {
  const cassandra = getCassandraClient();

  const [successResult, failedResult] = await Promise.all([
    cassandra.execute(
      `SELECT COUNT(*) as cnt FROM session_log WHERE user_id = ? AND event_type = 'LOGIN_SUCCESS'`,
      [userId],
      { prepare: true }
    ),
    cassandra.execute(
      `SELECT COUNT(*) as cnt FROM session_log WHERE user_id = ? AND event_type = 'LOGIN_FAILED'`,
      [userId],
      { prepare: true }
    ),
  ]);

  return {
    successfulLogins: successResult.rows[0]?.cnt?.low ?? 0,
    failedLogins: failedResult.rows[0]?.cnt?.low ?? 0,
  };
}

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return str; }
}

module.exports = { getUserSessionLog, getRecentActivityLog, getAuditLog, getLoginStats };