const express = require('express');
const cors = require('cors');

const app = express();

// Importar Rutas
const testRoutes = require('./routes/test.routes')
const healthRoutes = require('./routes/db_health.routes');

// Middlewares
app.use(cors());
app.use(express.json());

// Usar Rutas
app.use('/api', testRoutes);
app.use('/api', healthRoutes);

module.exports = app;
