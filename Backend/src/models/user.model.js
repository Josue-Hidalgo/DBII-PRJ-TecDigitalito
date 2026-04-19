const mongoose = require('mongoose');

// Historial de contraseñas — guarda los últimos N hashes usados (HU-08)
// Impide que el usuario reutilice contraseñas anteriores.
const passwordHistorySchema = new mongoose.Schema({
  passwordHash: { type: String, required: true },
  changedAt:    { type: Date,   default: Date.now },
}, { _id: false });

const userSchema = new mongoose.Schema(
  {
    username: {
      type:     String,
      required: true,
      unique:   true,
      trim:     true,
      lowercase: true,
    },
    passwordHash: {
      type:     String,
      required: true,
    },
    salt: {
      type:     String,
      required: true,
    },
    fullName: {
      type:     String,
      required: true,
      trim:     true,
    },
    birthDate: {
      type:     Date,
      required: true,
    },
    avatar: {
      type:    String,
      default: '',
    },

    // Necesario para notificaciones: bloqueo (HU-03), actividad sospechosa (HU-04),
    // recuperación de contraseña (HU-07). El worker de Redis lo lee desde aquí.
    email: {
      type:     String,
      required: true,
      unique:   true,
      trim:     true,
      lowercase: true,
    },

    // Últimas N contraseñas hasheadas — impide reutilización (HU-08).
    // La política del sistema define cuántas recordar; se recomienda 5.
    passwordHistory: {
      type:    [passwordHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Índice de texto para búsqueda de usuarios por nombre o username (HU-29)
userSchema.index({ username: 'text', fullName: 'text' });

module.exports = mongoose.model('User', userSchema);