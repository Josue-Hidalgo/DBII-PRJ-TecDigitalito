// Para el hasheo de la contraseña
const crypto = require('crypto');
const User = require('../models/user.model');

// Funcion para hashear contraseña
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// GET <- /api/test
exports.getTest = async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash -salt');

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

// POST <- /api/auth/register
exports.registerUser = async (req, res) => {
  try {
    const { username, password, fullName, birthDate, avatar } = req.body;

    if (!username || !password || !fullName || !birthDate) {
      return res.status(400).json({
        message: 'Faltan campos obligatorios',
      });
    }

    const existingUser = await User.findOne({
      username: username.trim().toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        message: 'El nombre de usuario ya existe',
      });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    const newUser = new User({
      username: username.trim().toLowerCase(),
      passwordHash,
      salt,
      fullName: fullName.trim(),
      birthDate,
      avatar: avatar || '',
    });

    await newUser.save();

    res.status(201).json({
      message: 'Usuario registrado correctamente',
      user: {
        id: newUser._id,
        username: newUser.username,
        fullName: newUser.fullName,
        birthDate: newUser.birthDate,
        avatar: newUser.avatar,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al registrar usuario',
      error: error.message,
    });
  }
};

// DELETE <- /api/users
exports.deleteAllUsers = async (req, res) => {
  try {
    const result = await User.deleteMany({});

    res.json({
      message: `Se eliminaron ${result.deletedCount} usuarios`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};