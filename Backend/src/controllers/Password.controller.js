const {
  requestPasswordReset,
  resetPassword,
  changePassword,
} = require('../logic/Password');

// ── POST /api/password/forgot  (HU-07 paso 1) ────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'email requerido.' });
    }

    const result = await requestPasswordReset({ email });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── POST /api/password/reset  (HU-07 paso 2) ─────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({ message: 'Faltan campos: resetToken y newPassword son requeridos.' });
    }

    const result = await resetPassword({ resetToken, newPassword });
    res.json(result);
  } catch (error) {
    const status =
      error.message.includes('inválido') ||
      error.message.includes('expirado') ||
      error.message.includes('utilizado') ||
      error.message.includes('política') ||
      error.message.includes('reutilizar')
        ? 400
        : 500;
    res.status(status).json({ message: error.message });
  }
};

// ── PUT /api/password/change  (HU-08) ─────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Faltan campos: userId, currentPassword y newPassword son requeridos.' });
    }

    const result = await changePassword({ userId, currentPassword, newPassword });
    res.json(result);
  } catch (error) {
    const status =
      error.message.includes('incorrecta') ||
      error.message.includes('política') ||
      error.message.includes('reutilizar')
        ? 400
        : 500;
    res.status(status).json({ message: error.message });
  }
};
