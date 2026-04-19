const { requestPasswordReset, resetPassword, changePassword } = require('../../logic/Password');

// POST /api/password/forgot  — HU-7 paso 1
exports.forgotPassword = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: 'username requerido.' });

    const result = await requestPasswordReset({ username });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/password/reset  — HU-7 paso 2
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) return res.status(400).json({ message: 'Faltan campos.' });

    const result = await resetPassword({ resetToken, newPassword });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('inválido') || error.message.includes('política') ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
};

// PUT /api/password/change  — HU-8
exports.changePassword = async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Faltan campos.' });
    }

    const result = await changePassword({ userId, currentPassword, newPassword });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('incorrecta') || error.message.includes('política') ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
};