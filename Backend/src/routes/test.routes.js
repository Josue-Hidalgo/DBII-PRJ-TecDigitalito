const express = require('express');
const router = express.Router();

const testController = require('../controllers/test.controller');

// GET <- /api/test
router.get('/test', testController.getTest);

// POST <- /api/auth/register
router.post('/auth/register', testController.registerUser);

// DELETE <- /api/users
router.delete('/users', testController.deleteAllUsers);

module.exports = router;