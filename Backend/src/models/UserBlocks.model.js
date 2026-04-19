const { getClient } = require('../../config/redis');

// TTL de bloqueo: 30 minutos por defecto (HU-03: desbloqueo automático)
const BLOCK_TTL = parseInt(process.env.BLOCK_TTL_SECONDS) || 30 * 60;
const KEY       = (userId) => `block:${userId}`;

/**
 * Bloquea una cuenta temporalmente (HU-03 / HU-04).
 *
 * Redis expira la key automáticamente al vencer el TTL → desbloqueo
 * sin intervención manual (HU-03, criterio de desbloqueo automático).
 *
 * Motivos posibles:
 *  - 'max_intentos_fallidos' : 5+ intentos consecutivos (HU-03)
 *  - 'sospecha'              : actividad anormal detectada (HU-04)
 *  - 'manual'                : bloqueo explícito por administrador
 *
 * @param {string} userId
 * @param {string} reason   - 'max_intentos_fallidos' | 'sospecha' | 'manual'
 * @param {string} ip       - IP que disparó el bloqueo (para auditoría en Cassandra)
 * @param {number} [ttl]    - Segundos de bloqueo; usa BLOCK_TTL si no se especifica
 */
const blockUser = async (
  userId,
  reason = 'max_intentos_fallidos',
  ip     = 'unknown',
  ttl    = BLOCK_TTL
) => {
  const client = getClient();
  const now    = Date.now();

  const data = {
    blocked:    true,
    reason,
    blocked_at: now,
    expires_at: now + ttl * 1000,
    ip_trigger: ip,
  };

  await client.setEx(KEY(userId), ttl, JSON.stringify(data));
};

/**
 * Comprueba si un usuario está bloqueado (HU-02 → mostrar "Credenciales inválidas").
 *
 * Nunca revela el motivo real del bloqueo al cliente para no dar información
 * a un atacante (HU-02: mensaje genérico).
 *
 * @param {string} userId
 * @returns {Promise<{ blocked: boolean, reason: string|null, expiresAt: number|null }>}
 */
const isBlocked = async (userId) => {
  const client = getClient();
  const raw    = await client.get(KEY(userId));
  if (!raw) return { blocked: false, reason: null, expiresAt: null };

  const data = JSON.parse(raw);
  return {
    blocked:   true,
    reason:    data.reason,
    expiresAt: data.expires_at,
  };
};

/**
 * Desbloqueo manual por un administrador (HU-03, criterio extra).
 * El desbloqueo automático ocurre al expirar el TTL de Redis.
 *
 * @param {string} userId
 */
const unblockUser = async (userId) => {
  const client = getClient();
  await client.del(KEY(userId));
};

module.exports = {
  blockUser,
  isBlocked,
  unblockUser,
  BLOCK_TTL,
};
