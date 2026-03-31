const express = require('express');
const router = express.Router();

const testController = require('../controllers/test.controller');

// GET <- /api/test
router.get('/test', testController.getTest);

// POST <- /api/users
router.post('/users', testController.createUser);

module.exports = router;