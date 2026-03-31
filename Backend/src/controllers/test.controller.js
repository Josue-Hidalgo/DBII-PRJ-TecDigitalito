const User = require('../models/user.model');

// GET /api/test
exports.getTest = async (req, res) => {
  try {
    const users = await User.find();

    res.json({
      message: 'Backend funcionando correctamente',
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};