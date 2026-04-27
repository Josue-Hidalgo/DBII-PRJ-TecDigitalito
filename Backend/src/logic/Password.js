const User = require('../models/User.model');
const {
  createResetToken,
  validateResetToken,
  consumeResetToken,
} = require('../models/PasswordReset.model');
const { enqueueNotification }  = require('../models/NotificationQueue.model');
const { deleteAllUserSessions } = require('../models/Sessions.model');
const { deleteRememberToken }   = require('../models/RememberMe.model');
const { resetAttempts }         = require('../models/LoginAttempts.model');
const { hashPassword, validatePasswordPolicy } = require('./Register');

/**
 * Verifica que la nueva contraseña no esté en el historial del usuario (HU-08).
 * Compara contra los últimos N hashes almacenados.
 *
 * @param {string} newPassword
 * @param {string} salt
 * @param {Array}  passwordHistory  - Array de { passwordHash, changedAt }
 * @returns {boolean}  true si la contraseña YA fue usada antes
 */
const isPreviousPassword = (newPassword, salt, passwordHistory = []) => {
  const newHash = hashPassword(newPassword, salt);
  return passwordHistory.some((h) => h.passwordHash === newHash);
};

// ── HU-07 Paso 1 — Solicitar enlace de recuperación ──────────────────────────

/**
 * Solicita recuperación de contraseña (HU-07, paso 1).
 *
 * Siempre responde con el mismo mensaje independientemente de si el usuario
 * existe, para no revelar qué usernames están registrados.
 *
 * @param {object} params
 * @param {string} params.username
 * @returns {Promise<{ message: string }>}
 */
const requestPasswordReset = async ({ email }) => {
  const user = await User.findOne({
    email: email.trim().toLowerCase()
  }).lean();

  if (user) {
    const token = await createResetToken(user._id, user.email);

    await enqueueNotification(user._id, user.email, 'reset_password', {
      reset_token: token,
      timestamp: Date.now(),
    });
  }

  return {
    message: 'Si el correo existe, recibirás un correo con instrucciones para restablecer tu contraseña.',
  };
};

// ── HU-07 Paso 2 — Restablecer contraseña con token ──────────────────────────

/**
 * Restablece la contraseña usando el token de un solo uso (HU-07, paso 2).
 *
 * @param {object} params
 * @param {string} params.resetToken
 * @param {string} params.newPassword
 * @returns {Promise<{ message: string }>}
 */
const resetPassword = async ({ resetToken, newPassword }) => {
  // Validar token
  const { valid, userId, reason } = await validateResetToken(resetToken);
  if (!valid) {
    const messages = {
      token_no_encontrado: 'El enlace de recuperación no es válido o ha expirado.',
      token_ya_usado:      'Este enlace ya fue utilizado. Solicita uno nuevo.',
    };
    throw new Error(messages[reason] || 'Token inválido.');
  }

  // Validar política de contraseña
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) throw new Error(policy.reason);

  // Obtener usuario
  const user = await User.findById(userId);
  if (!user) throw new Error('Usuario no encontrado.');

  // Verificar historial (HU-08: no reutilizar contraseñas anteriores)
  if (isPreviousPassword(newPassword, user.salt, user.passwordHistory)) {
    throw new Error('No puedes usar una contraseña que ya hayas utilizado antes. Elige una nueva.');
  }

  // Actualizar hash y salt (se genera nuevo salt por seguridad)
  const { hashPassword: hash } = require('./Register');
  const crypto = require('crypto');
  const newSalt = crypto.randomBytes(32).toString('hex');
  const newHash = hash(newPassword, newSalt);

  // Guardar en historial (mantener últimos 5)
  const MAX_HISTORY = parseInt(process.env.PASSWORD_HISTORY_LIMIT) || 5;
  user.passwordHistory.unshift({ passwordHash: newHash, changedAt: new Date() });
  if (user.passwordHistory.length > MAX_HISTORY) {
    user.passwordHistory = user.passwordHistory.slice(0, MAX_HISTORY);
  }

  user.salt         = newSalt;
  user.passwordHash = newHash;
  await user.save();

  // Invalidar token (HU-07: un solo uso)
  await consumeResetToken(resetToken);

  // Invalidar todas las sesiones activas por seguridad
  await deleteAllUserSessions(userId);
  await deleteRememberToken(userId);

  // Limpiar intentos fallidos
  await resetAttempts(userId);

  return { message: 'Contraseña restablecida correctamente. Inicia sesión con tu nueva contraseña.' };
};

// ── HU-08 — Cambiar contraseña estando autenticado ───────────────────────────

/**
 * Cambia la contraseña del usuario autenticado (HU-08).
 *
 * Requisitos:
 *  - Contraseña actual correcta.
 *  - Nueva contraseña cumple política de seguridad.
 *  - Nueva contraseña no fue usada antes (historial).
 *  - Se invalidan TODAS las sesiones activas al cambiar (buena práctica de seguridad).
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.currentPassword
 * @param {string} params.newPassword
 * @returns {Promise<{ message: string }>}
 */
const changePassword = async ({ userId, currentPassword, newPassword }) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('Usuario no encontrado.');

  // Verificar contraseña actual
  const currentHash = hashPassword(currentPassword, user.salt);
  if (currentHash !== user.passwordHash) {
    throw new Error('La contraseña actual es incorrecta.');
  }

  // Validar política
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) throw new Error(policy.reason);

  // Verificar historial
  if (isPreviousPassword(newPassword, user.salt, user.passwordHistory)) {
    throw new Error('No puedes reutilizar una contraseña anterior. Elige una nueva contraseña.');
  }

  // Nuevo salt + hash
  const crypto  = require('crypto');
  const newSalt = crypto.randomBytes(32).toString('hex');
  const newHash = hashPassword(newPassword, newSalt);

  const MAX_HISTORY = parseInt(process.env.PASSWORD_HISTORY_LIMIT) || 5;
  user.passwordHistory.unshift({ passwordHash: newHash, changedAt: new Date() });
  if (user.passwordHistory.length > MAX_HISTORY) {
    user.passwordHistory = user.passwordHistory.slice(0, MAX_HISTORY);
  }

  user.salt         = newSalt;
  user.passwordHash = newHash;
  await user.save();

  // Invalidar sesiones y cookie remember_me (HU-08)
  await deleteAllUserSessions(userId);
  await deleteRememberToken(userId);

  return { message: 'Contraseña actualizada correctamente. Vuelve a iniciar sesión.' };
};

module.exports = {
  requestPasswordReset,
  resetPassword,
  changePassword,
};
