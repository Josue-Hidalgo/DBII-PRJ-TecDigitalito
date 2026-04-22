const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/Auth.controller');

// HU-01 — Registro de usuario
router.post('/register', register);

// HU-02 — Inicio de sesión
router.post('/login', login);

module.exports = router;
