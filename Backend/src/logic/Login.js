const crypto   = require('crypto');
const User     = require('../models/User.model');
const { createSession }           = require('../models/Sessions.model');
const { createRememberToken }     = require('../models/RememberMe.model');
const { registerFailedAttempt, resetAttempts } = require('../models/LoginAttempts.model');
const { blockUser, isBlocked }    = require('../models/UserBlocks.model');
const { enqueueNotification }     = require('../models/NotificationQueue.model');

/**
 * Hashea una contraseña con el salt del usuario usando PBKDF2.
 * Debe ser idéntica a la función usada en el registro.
 */
const hashPassword = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');

/**
 * Inicio de sesión (HU-02, HU-03, HU-04, HU-06).
 *
 * Flujo:
 *  1. Verificar bloqueo activo → rechazar con mensaje genérico (HU-03).
 *  2. Buscar usuario por username.
 *  3. Validar contraseña con hash+salt.
 *  4. Si falla:
 *     a. Registrar intento fallido en Redis (LoginAttempts).
 *     b. Si shouldBlock → crear bloqueo (UserBlocks) + encolar notificación (HU-03).
 *     c. Si suspicious  → encolar notificación de actividad sospechosa (HU-04).
 *     d. Siempre responder "Credenciales inválidas" (HU-02).
 *  5. Si tiene éxito:
 *     a. Resetear contador de intentos.
 *     b. Crear sesión en Redis (Sessions).
 *     c. Si rememberMe → crear cookie remember_me (RememberMe).
 *     d. Retornar sessionToken + datos públicos del usuario.
 *
 * @param {object} params
 * @param {string} params.username
 * @param {string} params.password
 * @param {string} params.ip
 * @param {string} params.userAgent
 * @param {boolean} params.rememberMe
 * @returns {Promise<{ success: boolean, message: string, sessionToken?: string, rememberToken?: string, user?: object, suspicious?: boolean }>}
 */
const login = async ({ username, password, ip, userAgent, rememberMe }) => {
  const genericError = { success: false, message: 'Credenciales inválidas.' };

  // ── 1. Buscar usuario ─────────────────────────────────────────────────────
  const user = await User.findOne({ username: username.toLowerCase() }).lean();
  if (!user) return genericError;

  // ── 2. Verificar bloqueo ANTES de validar password (HU-03) ───────────────
  const blockStatus = await isBlocked(user._id);
  if (blockStatus.blocked) return genericError;

  // ── 3. Validar contraseña ─────────────────────────────────────────────────
  const hash    = hashPassword(password, user.salt);
  const isValid = hash === user.passwordHash;

  if (!isValid) {
    // ── 4a. Registrar intento fallido ─────────────────────────────────────
    const { shouldBlock, suspicious, attempts } = await registerFailedAttempt(user._id, ip);

    const metadata = { ip, dispositivo: 'web', user_agent: userAgent, timestamp: Date.now() };

    // ── 4b. Bloqueo total (HU-03) ─────────────────────────────────────────
    if (shouldBlock) {
      await blockUser(user._id, 'max_intentos_fallidos', ip);
      await enqueueNotification(user._id, user.email, 'bloqueo', metadata);
    }
    // ── 4c. Actividad sospechosa (HU-04) ──────────────────────────────────
    else if (suspicious) {
      await enqueueNotification(user._id, user.email, 'actividad_sospechosa', metadata);
    }

    return genericError;
  }

  // ── 5. Login exitoso ──────────────────────────────────────────────────────

  // 5a. Resetear contador de intentos
  await resetAttempts(user._id);

  // 5b. Crear sesión (HU-02)
  const sessionId = crypto.randomBytes(32).toString('hex');
  await createSession(sessionId, {
    user_id:     user._id,
    ip,
    dispositivo: 'web',
    user_agent:  userAgent,
  });

  // 5c. Token remember_me si el usuario lo solicitó (HU-06)
  let rememberToken = null;
  if (rememberMe) {
    rememberToken = await createRememberToken(user._id, { ip, user_agent: userAgent });
  }

  const publicUser = {
    _id:      user._id,
    username: user.username,
    fullName: user.fullName,
    avatar:   user.avatar,
    email:    user.email,
  };

  return {
    success:       true,
    message:       'Login exitoso.',
    sessionToken:  sessionId,
    rememberToken,
    user:          publicUser,
    suspicious:    false,
  };
};

module.exports = { login };
