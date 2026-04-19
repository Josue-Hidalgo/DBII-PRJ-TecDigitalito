const {
  logout,
  invalidateAllSessions,
  validateSession,
} = require('../../logic/Session');

// ── POST /api/session/logout  (HU-05) ─────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    const sessionToken =
      req.headers['authorization']?.replace('Bearer ', '') ||
      req.cookies?.session_token;

    if (!sessionToken) {
      return res.status(400).json({ message: 'Token de sesión no proporcionado.' });
    }

    const ip        = req.ip || '0.0.0.0';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = await logout({ sessionToken, ip, userAgent });

    res.clearCookie('session_token');
    res.clearCookie('remember_token');
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/session/invalidate-all  (HU-05: cerrar todas las sesiones) ──────
exports.invalidateAll = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId requerido.' });

    const result = await invalidateAllSessions({ userId });

    res.clearCookie('session_token');
    res.clearCookie('remember_token');
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /api/session/validate  (HU-06: validar sesión / cookie remember_me) ───
exports.validate = async (req, res) => {
  try {
    const sessionToken =
      req.headers['authorization']?.replace('Bearer ', '') ||
      req.cookies?.session_token;

    if (!sessionToken) return res.status(401).json({ valid: false });

    // Intentar validar como session token directa; si no existe intentar remember_me
    const rememberToken = req.cookies?.remember_token;
    const userId        = req.query.userId || req.body?.userId;
    const userAgent     = req.headers['user-agent'] || 'unknown';
    const ip            = req.ip || '0.0.0.0';

    const result = await validateSession(sessionToken, {
      userId,
      rememberToken,
      userAgent,
      ip,
    });

    if (!result.valid) {
      return res.status(401).json({ valid: false, reason: result.reason });
    }

    res.json({ valid: true, session: result.session });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
