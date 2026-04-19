/**
 * Admin.controller.js — Endpoints de administración y auditoría (HU-10, Punto Extra).
 *
 * GET /api/admin/activity/:userId       — Logs completos de un usuario
 * GET /api/admin/security-events        — Eventos de seguridad por tipo
 * GET /api/admin/audit/:tableName       — Audit trail de una entidad
 * GET /api/admin/audit-by-date/:fecha   — Audit trail global por fecha
 * GET /api/admin/login-attempts/:userId — Intentos de login de un usuario
 * GET /api/admin/login-attempts-ip/:ip  — Intentos de login desde una IP
 */
 
const {
  getUserActivityLog,
  getSecurityEvents,
  getAuditTrail,
  getAuditTrailByDate,
  getLoginAttemptsByUser,
  getLoginAttemptsByIp,
} = require('../logic/Audit');

// GET /api/admin/activity/:userId  (HU-10)
exports.getUserActivity = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: 'userId requerido.' });

    const result = await getUserActivityLog(userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/security-events?type=block&limit=100
exports.getSecurityEvents = async (req, res) => {
  try {
    const { type = 'block', limit = 100 } = req.query;
    const validTypes = ['block', 'suspicious', 'password_reset', 'unblock'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: `type debe ser uno de: ${validTypes.join(', ')}.` });
    }

    const result = await getSecurityEvents(type, parseInt(limit));
    res.json({ events: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/audit/:tableName?recordId=xxx&limit=50  (Punto Extra)
exports.getAuditTrail = async (req, res) => {
  try {
    const { tableName } = req.params;
    const { recordId, limit = 50 } = req.query;
    if (!recordId) return res.status(400).json({ message: 'recordId requerido como query param.' });

    const result = await getAuditTrail(tableName, recordId, parseInt(limit));
    res.json({ trail: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/audit-by-date/:fecha?limit=200  (Punto Extra)
// fecha formato: YYYY-MM-DD
exports.getAuditTrailByDate = async (req, res) => {
  try {
    const { fecha } = req.params;
    const { limit = 200 } = req.query;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ message: 'fecha debe tener formato YYYY-MM-DD.' });
    }

    const result = await getAuditTrailByDate(fecha, parseInt(limit));
    res.json({ fecha, trail: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/login-attempts/:userId?limit=50
exports.getLoginAttemptsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;

    const result = await getLoginAttemptsByUser(userId, parseInt(limit));
    res.json({ attempts: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/login-attempts-ip/:ip?limit=50
exports.getLoginAttemptsByIp = async (req, res) => {
  try {
    const { ip } = req.params;
    const { limit = 50 } = req.query;

    const result = await getLoginAttemptsByIp(ip, parseInt(limit));
    res.json({ ip, attempts: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
