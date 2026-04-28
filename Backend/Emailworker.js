/**
 * emailWorker.js
 *
 * Worker que consume la cola `notification_queue` de Redis
 * y envía correos reales con Nodemailer.
 *
 * USO:
 *   node emailWorker.js
 *
 * VARIABLES DE ENTORNO requeridas (.env):
 *   EMAIL_HOST=smtp.gmail.com          (o smtp.office365.com, etc.)
 *   EMAIL_PORT=587
 *   EMAIL_SECURE=false                 (true solo para puerto 465)
 *   EMAIL_USER=tu_correo@gmail.com
 *   EMAIL_PASS=tu_contraseña_o_app_password
 *   EMAIL_FROM="TEC Digitalito <no-reply@tecdigitalito.com>"
 *   FRONTEND_URL=http://localhost:5500  (URL donde corre tu index.html)
 *
 * Si usas Gmail: activa "Contraseñas de aplicación" en tu cuenta Google
 * y usa esa contraseña de 16 caracteres en EMAIL_PASS.
 */
 
require('dotenv').config();
const nodemailer  = require('nodemailer');
const connectRedis = require('./src/config/redis');
const { dequeueNotification, ackNotification, retryOrDiscard } = require('./src/models/NotificationQueue.model');

// ── Configurar transporte SMTP ────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
 
const FROM        = process.env.EMAIL_FROM     || `"TEC Digitalito" <${process.env.EMAIL_USER}>`;
const FRONTEND    = process.env.FRONTEND_URL   || 'http://localhost:5500';
const POLL_MS     = parseInt(process.env.WORKER_POLL_MS) || 3000; // cada 3 segundos
 
// ── Plantillas de correo ──────────────────────────────────────────────────────
 
function buildEmail(tipo, metadata, email) {
  switch (tipo) {
 
    case 'reset_password': {
      const token     = metadata.reset_token;
      const resetLink = `${FRONTEND}/index.html#reset?token=${token}`;
      return {
        to:      email,
        subject: '🔑 Recupera tu contraseña — TEC Digitalito',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="color:#6c63ff;">TEC Digitalito</h2>
            <p>Recibimos una solicitud para restablecer tu contraseña.</p>
            <p>Haz clic en el botón para crear una nueva contraseña. 
               El enlace es válido por <strong>20 minutos</strong> y solo puede usarse <strong>una vez</strong>.</p>
            <a href="${resetLink}"
               style="display:inline-block;background:#6c63ff;color:#fff;
                      padding:12px 28px;border-radius:6px;text-decoration:none;
                      font-weight:bold;margin:16px 0;">
              Restablecer contraseña
            </a>
            <p style="font-size:12px;color:#888;">
              Si no solicitaste esto, ignora este correo. Tu cuenta está segura.
            </p>
            <p style="font-size:11px;color:#bbb;">
              O copia este enlace: ${resetLink}
            </p>
          </div>
        `,
      };
    }
 
    case 'bloqueo': {
      return {
        to:      email,
        subject: '🔒 Tu cuenta ha sido bloqueada — TEC Digitalito',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="color:#e74c3c;">Cuenta Bloqueada</h2>
            <p>Tu cuenta en <strong>TEC Digitalito</strong> ha sido bloqueada temporalmente
               por múltiples intentos de inicio de sesión fallidos.</p>
            <p><strong>IP:</strong> ${metadata.ip || 'desconocida'}</p>
            <p><strong>Fecha:</strong> ${new Date(metadata.timestamp).toLocaleString('es-CR')}</p>
            <p>Si fuiste tú, puedes recuperar el acceso usando 
               <a href="${FRONTEND}/index.html#forgot">¿Olvidaste tu contraseña?</a>.</p>
            <p>Si no fuiste tú, alguien podría estar intentando acceder a tu cuenta.</p>
          </div>
        `,
      };
    }
 
    case 'actividad_sospechosa': {
      return {
        to:      email,
        subject: '⚠️ Actividad sospechosa detectada — TEC Digitalito',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="color:#f39c12;">Actividad Sospechosa</h2>
            <p>Detectamos un acceso inusual en tu cuenta de <strong>TEC Digitalito</strong>.</p>
            <p><strong>IP:</strong> ${metadata.ip || 'desconocida'}</p>
            <p><strong>Dispositivo:</strong> ${metadata.user_agent || 'desconocido'}</p>
            <p><strong>Fecha:</strong> ${new Date(metadata.timestamp).toLocaleString('es-CR')}</p>
            <p>Si no reconoces esta actividad, 
               <a href="${FRONTEND}/index.html#forgot">cambia tu contraseña inmediatamente</a>.</p>
          </div>
        `,
      };
    }
 
    default:
      return null;
  }
}
 
// ── Loop principal del worker ─────────────────────────────────────────────────
 
async function processOne() {
  let item = null;
  try {
    item = await dequeueNotification();
    if (!item) return; // cola vacía
 
    const { id, data } = item;
    const mailOptions  = buildEmail(data.tipo, data.metadata, data.email);
 
    if (!mailOptions) {
      console.warn(`[worker] Tipo de notificación desconocido: ${data.tipo} — descartando`);
      await ackNotification(id);
      return;
    }
 
    await transporter.sendMail({ from: FROM, ...mailOptions });
 
    await ackNotification(id);
    console.log(`[worker] ✅ Correo enviado (${data.tipo}) → ${data.email}`);
 
  } catch (err) {
    console.error(`[worker] ❌ Error enviando correo:`, err.message);
 
    if (item) {
      const requeued = await retryOrDiscard(item.id);
      if (requeued) {
        console.log(`[worker] 🔄 Reencolado para reintento: ${item.id}`);
      } else {
        console.log(`[worker] 🗑️  Descartado tras máximos reintentos: ${item.id}`);
      }
    }
  }
}
 
async function run() {
  // Conectar Redis antes de cualquier otra cosa
  try {
    await connectRedis();
    console.log('[worker] ✅ Redis listo.');
  } catch(err) {
    console.error('[worker] ❌ Falló conexión Redis:', err.message);
    process.exit(1);
  }

  // Verificar conexión SMTP al arrancar
  try {
    await transporter.verify();
    console.log('[worker] ✅ Conexión SMTP verificada correctamente.');
  } catch (err) {
    console.error('[worker] ❌ No se pudo conectar al servidor SMTP:', err.message);
    console.error('         Revisa EMAIL_HOST, EMAIL_USER y EMAIL_PASS en tu .env');
    process.exit(1);
  }

  console.log(`[worker] 🚀 Email worker iniciado. Revisando cola cada ${POLL_MS}ms...`);

  // Polling continuo
  const loop = async () => {
    await processOne();
    setTimeout(loop, POLL_MS);
  };

  loop();
}
 
run();
 