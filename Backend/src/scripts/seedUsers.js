const mongoose = require('mongoose');
const User = require('../models/user.model');
require('dotenv').config();

// Datos de testing para usuarios
const testUsers = [
  {
    name: 'Juan Pérez',
    email: 'juan.perez@test.com'
  },
  {
    name: 'María García',
    email: 'maria.garcia@test.com'
  },
  {
    name: 'Carlos López',
    email: 'carlos.lopez@test.com'
  },
  {
    name: 'Ana Martínez',
    email: 'ana.martinez@test.com'
  },
  {
    name: 'Luis Rodríguez',
    email: 'luis.rodriguez@test.com'
  },
  {
    name: 'Sofía Hernández',
    email: 'sofia.hernandez@test.com'
  },
  {
    name: 'Diego González',
    email: 'diego.gonzalez@test.com'
  },
  {
    name: 'Laura Sánchez',
    email: 'laura.sanchez@test.com'
  },
  {
    name: 'Roberto Ramírez',
    email: 'roberto.ramirez@test.com'
  },
  {
    name: 'Patricia Torres',
    email: 'patricia.torres@test.com'
  }
];

async function seedUsers() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tecdigitalito_mongo_db');
    console.log('Conectado a MongoDB');

    // Limpiar usuarios existentes (opcional)
    const existingCount = await User.countDocuments();
    console.log(`Usuarios existentes: ${existingCount}`);

    if (existingCount > 0) {
      console.log('Limpiando usuarios existentes...');
      await User.deleteMany({});
    }

    // Insertar usuarios de testing
    const insertedUsers = await User.insertMany(testUsers);
    console.log(`Se insertaron ${insertedUsers.length} usuarios de testing:`);
    
    insertedUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} - ${user.email}`);
    });

    // Verificar inserción
    const totalUsers = await User.countDocuments();
    console.log(`Total de usuarios en la base de datos: ${totalUsers}`);

  } catch (error) {
    console.error('Error al insertar usuarios:', error);
  } finally {
    // Cerrar conexión
    await mongoose.connection.close();
    console.log('Conexión cerrada');
  }
}

// Ejecutar el script
if (require.main === module) {
  seedUsers();
}

module.exports = seedUsers;
