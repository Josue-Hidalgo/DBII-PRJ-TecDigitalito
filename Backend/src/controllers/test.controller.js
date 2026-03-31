const User = require('../models/user.model');

// GET <- /api/test
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

// POST <- /api/users
exports.createUser = async (req, res) => {
  try {
    const { name, email } = req.body;

    const newUser = new User({ name, email});
    await newUser.save();

    res.status(201).json(newUser);
  } catch (error) {

    res.status(500).json({
      error: error.message,
    });
    
  }
};