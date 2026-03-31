const express = require('express');
const cors = require('cors');

const app = express();

// Importar Rutas
const testRoutes = require('./routes/test.routes')

// Middlewares
app.use(cors());
app.use(express());

// Usar Rutas
app.use('/api', testRoutes);

module.exports = app;
