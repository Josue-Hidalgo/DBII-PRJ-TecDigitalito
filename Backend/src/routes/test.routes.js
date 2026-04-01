const express = require('express');
const router = express.Router();

const testController = require('../controllers/test.controller');

// GET <- /api/test
router.get('/test', testController.getTest);

// POST <- /api/users
router.post('/users', testController.createUser);

// POST <- /api/users/seed (insertar datos de testing)
router.post('/users/seed', testController.seedUsers);

// DELETE <- /api/deleteUsers (eliminar todos)
router.delete('/deleteUsers', testController.deleteAllUsers);

module.exports = router;