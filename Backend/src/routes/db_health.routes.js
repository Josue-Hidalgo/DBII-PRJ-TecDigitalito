const express = require('express');
const router = express.Router();
const runHealthCheck = require('../config/healthCheck');

router.get('/health', async (req, res) => {
    try {
        const result = await runHealthCheck();
        const httpStatus = result.status === 'ok' ? 200 : 503;
        res.status(httpStatus).json(result);
    } catch (error) {
        res.status(503).json({ status: 'error', message: error.message });
    }
});

module.exports = router;