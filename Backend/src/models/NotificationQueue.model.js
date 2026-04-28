const { getClient } = require('../config/redis');
const crypto = require('crypto');

// TTL de cada notificación pendiente: 1 hora
// Si el worker no la procesa en ese tiempo, se descarta automáticamente
const NOTIFICATION_TTL = parseInt(process.env.NOTIFICATION_TTL_SECONDS) || 3600;
// Máximo de reintentos antes de descartar
const MAX_RETRIES = parseInt(process.env.NOTIFICATION_MAX_RETRIES) || 3;

const KEY       = (id) => `notify:${id}`;
const QUEUE_KEY = 'notification_queue'; // Lista Redis usada como cola FIFO

/**
 * Encola una notificación por correo (HU-03, HU-04, HU-07).
 *
 * Tipos soportados:
 *  - 'bloqueo'              : cuenta bloqueada por intentos fallidos (HU-03)
 *  - 'actividad_sospechosa' : login desde IP/dispositivo nuevo (HU-04)
 *  - 'reset_password'       : enlace de recuperación de contraseña (HU-07)
 *
 * Estrategia:
 *  1. Se crea un documento en `notify:{uuid}` con todos los datos del correo.
 *  2. Se empuja el uuid a la lista `notification_queue` (cola FIFO).
 *  3. El worker lee `LPOP notification_queue`, busca `notify:{uuid}` y envía el correo.
 *  4. Al completar: `DEL notify:{uuid}`.
 *  5. En caso de fallo: incrementar `intentos_envio`; descartar si supera MAX_RETRIES.
 *
 * @param {string} userId
 * @param {string} email
 * @param {'bloqueo'|'actividad_sospechosa'|'reset_password'} tipo
 * @param {object} metadata  - { ip, dispositivo, user_agent, reset_token?, timestamp? }
 * @returns {Promise<string>}  id de la notificación encolada
 */
const enqueueNotification = async (userId, email, tipo, metadata = {}) => {
  const client = getClient();
  const id     = crypto.randomUUID();
  const now    = Date.now();

  const data = {
    user_id:        userId.toString(),
    email,
    tipo,
    metadata: {
      ip:          metadata.ip          || 'unknown',
      dispositivo: metadata.dispositivo || 'unknown',
      user_agent:  metadata.user_agent  || 'unknown',
      timestamp:   metadata.timestamp   || now,
      // Solo para reset_password (HU-07): token que va en el enlace del correo
      reset_token: metadata.reset_token || null,
    },
    intentos_envio: 0,
    created_at:     now,
  };

  await client.setEx(KEY(id), NOTIFICATION_TTL, JSON.stringify(data));
  // Empujar ID a la cola (RPUSH → LPOP da orden FIFO)
  await client.rPush(QUEUE_KEY, id);

  return id;
};

/**
 * El worker llama a esta función para obtener la siguiente notificación pendiente.
 * Devuelve null si la cola está vacía.
 *
 * @returns {Promise<{ id: string, data: object }|null>}
 */
const dequeueNotification = async () => {
  const client = getClient();
  const id     = await client.lPop(QUEUE_KEY);
  if (!id) return null;

  const raw = await client.get(KEY(id));
  if (!raw) return null; // TTL expiró antes de procesar

  return { id, data: JSON.parse(raw) };
};

/**
 * Marca una notificación como enviada y la elimina de Redis.
 *
 * @param {string} id
 */
const ackNotification = async (id) => {
  const client = getClient();
  await client.del(KEY(id));
};

/**
 * Incrementa el contador de intentos del worker en caso de error de envío.
 * Si supera MAX_RETRIES, elimina la notificación (HU-03, criterio de descarte).
 *
 * @param {string} id
 * @returns {Promise<boolean>}  true si se reencola, false si se descartó
 */
const retryOrDiscard = async (id) => {
  const client = getClient();
  const raw    = await client.get(KEY(id));
  if (!raw) return false;

  const data = JSON.parse(raw);
  data.intentos_envio++;

  if (data.intentos_envio >= MAX_RETRIES) {
    await client.del(KEY(id));
    return false; // descartada
  }

  // Guardar con TTL reducido; reencolar
  await client.setEx(KEY(id), NOTIFICATION_TTL, JSON.stringify(data));
  await client.rPush(QUEUE_KEY, id);
  return true;
};

module.exports = {
  enqueueNotification,
  dequeueNotification,
  ackNotification,
  retryOrDiscard,
  NOTIFICATION_TTL,
  MAX_RETRIES,
};
