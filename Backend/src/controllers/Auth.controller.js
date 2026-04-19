const { registerUser } = require('../../logic/Register');
const { login } = require('../../logic/Login');

// POST /api/auth/register  — HU-1
exports.register = async (req, res) => {
  try {
    const { username, password, fullName, birthDate, photoBase64 } = req.body;
    if (!username || !password || !fullName || !birthDate) {
      return res.status(400).json({ message: 'Faltan campos obligatorios.' });
    }
    const result = await registerUser({ username, password, fullName, birthDate, photoBase64 });
    res.status(201).json(result);
  } catch (error) {
    const status = error.message.includes('ya está en uso') ? 409 : 500;
    res.status(status).json({ message: error.message });
  }
};

// POST /api/auth/login  — HU-2, HU-3, HU-4
exports.login = async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || '0.0.0.0';
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!username || !password) {
      return res.status(400).json({ message: 'Faltan campos obligatorios.' });
    }

    const result = await login({ username, password, ip, userAgent, rememberMe: !!rememberMe });

    if (!result.success) {
      return res.status(401).json({ message: result.message });
    }

    // Cookie de sesión (HU-6)
    if (rememberMe) {
      res.cookie('session_token', result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
        sameSite: 'strict',
      });
    }

    res.json({
      message: 'Login exitoso.',
      sessionToken: result.sessionToken,
      user: result.user,
      suspicious: result.suspicious,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};