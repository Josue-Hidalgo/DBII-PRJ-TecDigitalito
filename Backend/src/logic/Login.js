const crypto   = require('crypto');
const User     = require('../models/User.model');
const { createSession }                        = require('../models/Sessions.model');
const { createRememberToken }                  = require('../models/RememberMe.model');
const { registerFailedAttempt, resetAttempts } = require('../models/LoginAttempts.model');
const { blockUser, isBlocked }                 = require('../models/UserBlocks.model');
const { enqueueNotification }                  = require('../models/NotificationQueue.model');
// ── Integración Cassandra (HU-02, HU-03, HU-04, HU-10) ──────────────────────
const { logLoginAttempt, logSecurityEvent, logSessionActivity } = require('./Audit');

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
 *     b. Registrar en Cassandra (login_attempts_by_user / by_ip).
 *     c. Si shouldBlock → crear bloqueo (UserBlocks) + encolar notificación (HU-03).
 *     d. Si suspicious  → encolar notificación de actividad sospechosa (HU-04).
 *     e. Siempre responder "Credenciales inválidas" (HU-02).
 *  5. Si tiene éxito:
 *     a. Resetear contador de intentos.
 *     b. Crear sesión en Redis (Sessions).
 *     c. Registrar en Cassandra (sesión + intento exitoso).
 *     d. Si rememberMe → crear cookie remember_me (RememberMe).
 *     e. Retornar sessionToken + datos públicos del usuario.
 *
 * @param {object} params
 * @param {string} params.username
 * @param {string} params.password
 * @param {string} params.ip
 * @param {string} params.userAgent
 * @param {boolean} params.rememberMe
 */
const login = async ({ username, password, ip, userAgent, rememberMe }) => {
  const genericError = { success: false, message: 'Credenciales inválidas.' };

  // ── 1. Buscar usuario ─────────────────────────────────────────────────────
  const user = await User.findOne({ username: username.toLowerCase() }).lean();

  // ── 2. Verificar bloqueo ANTES de validar password (HU-03) ───────────────
  if (user) {
    const blockStatus = await isBlocked(user._id);
    if (blockStatus.blocked) {
      // Registrar intento bloqueado en Cassandra
      logLoginAttempt({
        userId:    user._id,
        ip,
        userAgent,
        success:   false,
        reason:    'account_blocked',
      });
      return genericError;
    }
  }

  // ── 3. Validar contraseña ─────────────────────────────────────────────────
  const isValid = user
    ? hashPassword(password, user.salt) === user.passwordHash
    : false;

  if (!isValid) {
    // ── 4a. Registrar en Redis ────────────────────────────────────────────
    let shouldBlock = false;
    let suspicious  = false;

    if (user) {
      const attemptResult = await registerFailedAttempt(user._id, ip);
      shouldBlock = attemptResult.shouldBlock;
      suspicious  = attemptResult.suspicious;
    }

    // ── 4b. Registrar en Cassandra (HU-10) ───────────────────────────────
    logLoginAttempt({
      userId:    user?._id || 'unknown',
      ip,
      userAgent,
      success:   false,
      reason:    user ? 'invalid_credentials' : 'user_not_found',
    });

    const metadata = { ip, dispositivo: 'web', user_agent: userAgent, timestamp: Date.now() };

    if (user) {
      // ── 4c. Bloqueo total (HU-03) ───────────────────────────────────────
      if (shouldBlock) {
        await blockUser(user._id, 'max_intentos_fallidos', ip);
        await enqueueNotification(user._id, user.email, 'bloqueo', metadata);
        logSecurityEvent({ eventType: 'block', userId: user._id, ip,
          details: JSON.stringify({ reason: 'max_intentos_fallidos' }) });
      }
      // ── 4d. Actividad sospechosa (HU-04) ────────────────────────────────
      else if (suspicious) {
        await enqueueNotification(user._id, user.email, 'actividad_sospechosa', metadata);
        logSecurityEvent({ eventType: 'suspicious', userId: user._id, ip,
          details: JSON.stringify({ reason: 'multiples_fallos' }) });
      }
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

  // 5c. Registrar en Cassandra (HU-10)
  logLoginAttempt({ userId: user._id, ip, userAgent, success: true, reason: 'success' });
  logSessionActivity({ userId: user._id, sessionId, action: 'login', ip, userAgent });

  // 5d. Token remember_me si el usuario lo solicitó (HU-06)
  let rememberToken = null;
  if (rememberMe) {
    rememberToken = await createRememberToken(user._id, { ip, user_agent: userAgent });
    logSessionActivity({ userId: user._id, sessionId, action: 'remember_me', ip, userAgent });
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
