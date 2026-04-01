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

// POST <- /api/users/seed
exports.seedUsers = async (req, res) => {
  try {
    // Datos de testing para usuarios
    const testUsers = [
      { name: 'Juan Pérez', email: 'juan.perez@test.com' },
      { name: 'María García', email: 'maria.garcia@test.com' },
      { name: 'Carlos López', email: 'carlos.lopez@test.com' },
      { name: 'Ana Martínez', email: 'ana.martinez@test.com' },
      { name: 'Luis Rodríguez', email: 'luis.rodriguez@test.com' },
      { name: 'Sofía Hernández', email: 'sofia.hernandez@test.com' },
      { name: 'Diego González', email: 'diego.gonzalez@test.com' },
      { name: 'Laura Sánchez', email: 'laura.sanchez@test.com' },
      { name: 'Roberto Ramírez', email: 'roberto.ramirez@test.com' },
      { name: 'Patricia Torres', email: 'patricia.torres@test.com' }
    ];

    // Limpiar usuarios existentes
    await User.deleteMany({});
    console.log('Usuarios existentes eliminados');

    // Insertar usuarios de testing
    const insertedUsers = await User.insertMany(testUsers);
    
    res.status(201).json({
      message: `Se insertaron ${insertedUsers.length} usuarios de testing`,
      users: insertedUsers
    });
  } catch (error) {
    res.status(500).json({
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
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};