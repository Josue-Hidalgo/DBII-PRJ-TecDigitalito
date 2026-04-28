const express = require('express');
const router  = express.Router();
const {
  getUserActivity,
  getSecurityEvents,
  getAuditTrail,
  getAuditTrailByDate,
  getLoginAttemptsByUser,
  getLoginAttemptsByIp,
} = require('../controllers/Admin.controller');

// HU-10 — Logs de actividad de un usuario
router.get('/activity/:userId', getUserActivity);

// HU-10 / HU-04 — Eventos de seguridad globales
router.get('/security-events', getSecurityEvents);

// Punto Extra — Audit trail por entidad
router.get('/audit/:tableName', getAuditTrail);

// Punto Extra — Audit trail global por fecha
router.get('/audit-by-date/:fecha', getAuditTrailByDate);

// HU-10 — Intentos de login de un usuario
router.get('/login-attempts/:userId', getLoginAttemptsByUser);

// HU-10 — Intentos de login desde una IP
router.get('/login-attempts-ip/:ip', getLoginAttemptsByIp);

module.exports = router;