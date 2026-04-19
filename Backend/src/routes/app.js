const express = require('express');
const cors = require('cors');

const app = express();

// ── Importar Rutas ────────────────────────────────────────────────────────────
const healthRoutes      = require('./routes/db_health.routes');
const authRoutes        = require('./routes/auth.routes');
const sessionRoutes     = require('./routes/session.routes');
const passwordRoutes    = require('./routes/password.routes');
const coursesRoutes     = require('./routes/courses.routes');
const enrollmentRoutes  = require('./routes/enrollment.routes');
const evaluationsRoutes = require('./routes/evaluations.routes');
const messagesRoutes    = require('./routes/messages.routes');
const socialRoutes      = require('./routes/social.routes');

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));   // base64 de fotos/avatares puede ser grande

// ── Registrar Rutas ───────────────────────────────────────────────────────────
app.use('/api/health',       healthRoutes);       // GET  /api/health

app.use('/api/auth',         authRoutes);         // POST /api/auth/register
                                                  // POST /api/auth/login

app.use('/api/session',      sessionRoutes);      // POST /api/session/logout
                                                  // POST /api/session/invalidate-all
                                                  // GET  /api/session/validate

app.use('/api/password',     passwordRoutes);     // POST /api/password/forgot
                                                  // POST /api/password/reset
                                                  // PUT  /api/password/change

app.use('/api/courses',      coursesRoutes);      // HU-11 al 19 (gestión docente)

app.use('/api/enrollments',  enrollmentRoutes);   // HU-20 al 23 (estudiante)

app.use('/api/evaluations',  evaluationsRoutes);  // HU-14, 24, 25

app.use('/api/messages',     messagesRoutes);     // HU-17, 26, 30

app.use('/api/social',       socialRoutes);       // HU-27, 28, 29

module.exports = app;
