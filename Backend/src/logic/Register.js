const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User.model');
// ── Integración Cassandra (Punto Extra: audit) ────────────────────────────────
const { auditChange } = require('./Audit');

/**
 * Hashea una contraseña usando PBKDF2 con el salt dado.
 * 100.000 iteraciones, digest sha512, 64 bytes de salida.
 */
const hashPassword = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');

/**
 * Valida que la contraseña cumpla la política de seguridad (HU-08).
 * Mínimo 8 caracteres, al menos una mayúscula, una minúscula, un número y un símbolo.
 *
 * @param {string} password
 * @returns {{ valid: boolean, reason: string|null }}
 */
const validatePasswordPolicy = (password) => {
  if (!password || password.length < 8)
    return { valid: false, reason: 'La contraseña debe tener al menos 8 caracteres.' };
  if (!/[A-Z]/.test(password))
    return { valid: false, reason: 'La contraseña debe contener al menos una letra mayúscula.' };
  if (!/[a-z]/.test(password))
    return { valid: false, reason: 'La contraseña debe contener al menos una letra minúscula.' };
  if (!/[0-9]/.test(password))
    return { valid: false, reason: 'La contraseña debe contener al menos un número.' };
  if (!/[^A-Za-z0-9]/.test(password))
    return { valid: false, reason: 'La contraseña debe contener al menos un símbolo especial.' };
  return { valid: true, reason: null };
};

/**
 * Registra un nuevo usuario en la plataforma (HU-01).
 *
 * - Username y email son únicos (índices en MongoDB).
 * - La contraseña se hashea con PBKDF2 + salt aleatorio de 32 bytes.
 * - El avatar puede enviarse como base64 o URL; se guarda en el campo avatar.
 *
 * @param {object} params
 * @param {string} params.username
 * @param {string} params.password      - Contraseña en texto plano (se hashea aquí)
 * @param {string} params.fullName
 * @param {string|Date} params.birthDate
 * @param {string} [params.email]       - Requerido para notificaciones (HU-03/04/07)
 * @param {string} [params.photoBase64] - Avatar opcional
 * @returns {Promise<{ userId: string, username: string, message: string }>}
 */
const registerUser = async ({ username, password, fullName, birthDate, email, photoBase64 }) => {
  // Validar política de contraseña
  const policy = validatePasswordPolicy(password);
  if (!policy.valid) throw new Error(policy.reason);

  // Generar salt y hash
  const salt         = crypto.randomBytes(32).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const userId       = uuidv4();

  const user = new User({
    _id:          userId,
    username:     username.trim().toLowerCase(),
    passwordHash,
    salt,
    fullName:     fullName.trim(),
    birthDate:    new Date(birthDate),
    email:        (email || '').trim().toLowerCase(),
    avatar:       photoBase64 || '',
    passwordHistory: [{ passwordHash, changedAt: new Date() }],
  });

  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) {
      const field = err.keyPattern?.username ? 'username' : 'email';
      throw new Error(`El ${field} ya está en uso.`);
    }
    throw err;
  }

  // Sincronizar con Neo4j para el grafo social
  const { syncUserToGraph } = require('./Social');
  await syncUserToGraph({ userId, username, fullName: fullName.trim(), avatar: photoBase64 || '' });

  // ── Audit trail en Cassandra (Punto Extra) ────────────────────────────────
  auditChange({
    tableName:  'users',
    recordId:   userId,
    operation:  'CREATE',
    userId,
    newValues: {
      username:  username.trim().toLowerCase(),
      fullName:  fullName.trim(),
      email:     (email || '').trim().toLowerCase(),
    },
  });

  return {
    userId,
    username: user.username,
    message:  'Usuario registrado correctamente.',
  };
};

module.exports = { registerUser, validatePasswordPolicy, hashPassword };
