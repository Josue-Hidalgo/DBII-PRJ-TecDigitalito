const express = require('express');
const router = express.Router();
const { forgotPassword, resetPassword, changePassword } = require('../controllers/Password.controller');

// HU-07 — Solicitar enlace de recuperación de contraseña (paso 1)
router.post('/forgot', forgotPassword);

// HU-07 — Restablecer contraseña con token de un solo uso (paso 2)
router.post('/reset', resetPassword);

// HU-08 — Cambiar contraseña estando autenticado
router.put('/change', changePassword);

module.exports = router;
