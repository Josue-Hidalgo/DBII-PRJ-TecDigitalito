const { registerUser } = require('../../logic/Register');
const { login }        = require('../../logic/Login');

// ── POST /api/auth/register  (HU-01) ─────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { username, password, fullName, birthDate, email, photoBase64 } = req.body;

    if (!username || !password || !fullName || !birthDate || !email) {
      return res.status(400).json({ message: 'Faltan campos obligatorios.' });
    }

    const result = await registerUser({ username, password, fullName, birthDate, email, photoBase64 });
    res.status(201).json(result);
  } catch (error) {
    const status = error.message.includes('ya está en uso') ? 409 : 400;
    res.status(status).json({ message: error.message });
  }
};

// ── POST /api/auth/login  (HU-02, HU-03, HU-04, HU-06) ──────────────────────
exports.login = async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Faltan campos obligatorios.' });
    }

    const ip        = req.ip || req.headers['x-forwarded-for'] || '0.0.0.0';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = await login({
      username,
      password,
      ip,
      userAgent,
      rememberMe: !!rememberMe,
    });

    if (!result.success) {
      return res.status(401).json({ message: result.message });
    }

    // Cookie de sesión HttpOnly + Secure para el token de sesión (HU-06)
    res.cookie('session_token', result.sessionToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   rememberMe
        ? 30 * 24 * 60 * 60 * 1000  // 30 días si rememberMe
        : 2 * 60 * 60 * 1000,       // 2 horas si sesión normal
    });

    // Cookie remember_me separada (HU-06)
    if (result.rememberToken) {
      res.cookie('remember_token', result.rememberToken, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge:   30 * 24 * 60 * 60 * 1000, // 30 días
      });
    }

    res.json({
      message:      'Login exitoso.',
      sessionToken: result.sessionToken,
      user:         result.user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
