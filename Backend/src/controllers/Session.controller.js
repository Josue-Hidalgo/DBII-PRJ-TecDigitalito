const { logout, invalidateAllSessions, validateRememberMeToken } = require('../../logic/Session');

// POST /api/session/logout  — HU-5
exports.logout = async (req, res) => {
  try {
    const sessionToken = req.headers['authorization']?.replace('Bearer ', '') || req.cookies?.session_token;
    if (!sessionToken) return res.status(400).json({ message: 'Token de sesión no proporcionado.' });

    const ip = req.ip || '0.0.0.0';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = await logout({ sessionToken, ip, userAgent });

    res.clearCookie('session_token');
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/session/invalidate-all  — HU-5 (cerrar todas las sesiones)
exports.invalidateAll = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId requerido.' });

    const result = await invalidateAllSessions({ userId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/session/validate  — HU-6 (validar cookie remember me)
exports.validate = async (req, res) => {
  try {
    const sessionToken = req.headers['authorization']?.replace('Bearer ', '') || req.cookies?.session_token;
    if (!sessionToken) return res.status(401).json({ valid: false });

    const result = await validateRememberMeToken(sessionToken);
    if (!result.valid) return res.status(401).json({ valid: false, reason: result.reason });

    res.json({ valid: true, session: result.session });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};