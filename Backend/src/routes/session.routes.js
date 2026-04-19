const express = require('express');
const router = express.Router();
const { logout, invalidateAll, validate } = require('../controllers/Session.controller');

// HU-05 — Cerrar sesión
router.post('/logout', logout);

// HU-05 — Cerrar todas las sesiones activas del usuario
router.post('/invalidate-all', invalidateAll);

// HU-06 — Validar cookie "Recordarme" / sesión activa
router.get('/validate', validate);

module.exports = router;
