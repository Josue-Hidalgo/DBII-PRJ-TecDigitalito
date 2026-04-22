# Redis — Modelo Agregado

## Justificación
Redis se usa para toda la información volátil de sesión y seguridad que requiere acceso en microsegundos y expiración automática por TTL: tokens de sesión, cookies de "recordarme", contadores de intentos fallidos, bloqueos temporales y tokens de recuperación de contraseña. Su estructura de clave-valor con TTL nativo elimina la necesidad de jobs de limpieza. También actúa como cola de notificaciones por correo.

## Entidades

* Session (tokens de sesión activos)
* RememberMe (cookies de sesión persistente)
* LoginAttempts (contador temporal de fallos)
* UserBlock (bloqueo temporal de cuenta)
* PasswordResetToken (token de un solo uso para recuperar contraseña)
* NotificationQueue (cola de correos pendientes)

---

## BUCKET: sessions

> **HU-02** — Inicio de sesión: se crea la sesión al autenticar correctamente
> **HU-05** — Cerrar sesión: se elimina la key para invalidar el token inmediatamente
> **HU-06** — Recordarme: si la cookie "remember me" es válida, se renueva la sesión sin pedir credenciales

* Key: `session:{session_id}`
* TTL: configurable por política (recomendado: 2 horas de inactividad, sliding window)

```json
{
    "user_id": "ref → users._id",
    "token": "string (JWT o token opaco)",
    "ip": "string",
    "dispositivo": "string",
    "user_agent": "string",
    "created_at": "timestamp",
    "expires_at": "timestamp"
}
```

> **`user_agent`** (agregado): junto con `ip` y `dispositivo`, permite detectar cambios de contexto que disparen la invalidación por actividad sospechosa (HU-04 / HU-06).
> Para cerrar sesión (HU-05): `DEL session:{session_id}` invalida el token inmediatamente, sin esperar a que expire el TTL.

---

## BUCKET: remember_me

> **HU-06** — Recordarme: cookie segura HttpOnly/Secure con expiración larga
> **HU-04** — Se invalida (`DEL remember:{user_id}`) si se detecta actividad sospechosa

* Key: `remember:{user_id}`
* TTL: configurable (recomendado: 30 días)

```json
{
    "token": "string (token aleatorio seguro, mínimo 32 bytes)",
    "ip_origen": "string",
    "user_agent_origen": "string",
    "created_at": "timestamp",
    "expires_at": "timestamp"
}
```

> La cookie que se envía al navegador contiene solo el `token`; el servidor lo valida buscando esta key.
> **`user_agent_origen`** (agregado): si la cookie se usa desde un user-agent distinto al de creación, puede marcarse como sospechosa y disparar HU-04.
> Se invalida automáticamente por TTL o de forma explícita con `DEL` al cerrar sesión (HU-05) o detectar actividad sospechosa (HU-04).

---

## BUCKET: login_attempts

> **HU-03** — Bloqueo: al llegar a 5 intentos fallidos se crea `block:{user_id}` y se encola notificación
> **HU-02** — Inicio de sesión: se incrementa el contador en cada fallo; se elimina la key en login exitoso
> **HU-04** — Actividad sospechosa: muchos intentos desde la misma cuenta en poco tiempo

* Key: `attempts:{user_id}`
* TTL: ventana deslizante (recomendado: 15 minutos desde el último intento fallido)

```json
{
    "attempts": 0,
    "last_attempt": "timestamp",
    "ip_ultimo": "string"
}
```

> **Flujo de bloqueo:**
> 1. Login falla → `INCR` el contador en `attempts:{user_id}`.
> 2. Si `attempts >= 5` → crear `block:{user_id}` (TTL = tiempo de bloqueo) + encolar `notify:{uuid}` de tipo `bloqueo`.
> 3. Login exitoso → `DEL attempts:{user_id}`.
> 4. TTL expirado → la cuenta se desbloquea automáticamente sin intervención manual (HU-03).

---

## BUCKET: user_blocks

> **HU-03** — Bloqueo temporal: la cuenta queda inutilizable hasta que expire el TTL o un admin la desbloquee
> **HU-04** — También se puede crear un bloqueo por actividad sospechosa (razón `sospecha`)

* Key: `block:{user_id}`
* TTL: igual al tiempo de bloqueo (recomendado: 15–30 minutos); Redis expira la key automáticamente

```json
{
    "blocked": true,
    "reason": "max_intentos_fallidos | sospecha | manual",
    "blocked_at": "timestamp",
    "expires_at": "timestamp",
    "ip_trigger": "string"
}
```

> **`ip_trigger`** (agregado): IP desde la que se generó el bloqueo, útil para el log de auditoría en Cassandra.
> Verificación en cada login: `EXISTS block:{user_id}` → si existe, rechazar y mostrar "Credenciales inválidas" sin revelar el motivo (HU-02).
> Desbloqueo automático: Redis elimina la key al vencer el TTL (HU-03, criterio de desbloqueo automático).

---

## BUCKET: password_reset_tokens

> **HU-07** — Recuperar contraseña: token de un solo uso enviado por correo, con expiración corta

* Key: `reset:{token}`
* TTL: igual a `expires_at` (recomendado: 15–30 minutos)

```json
{
    "user_id": "ref → users._id",
    "email": "string",
    "created_at": "timestamp",
    "expires_at": "timestamp",
    "used": false
}
```

> **`email`** (agregado): para verificar que el token corresponde al correo desde el que se solicitó el reset, añadiendo una capa extra de validación.
> **Flujo de uso único:**
> 1. Usuario hace clic en el enlace → verificar `EXISTS reset:{token}` y que `used == false`.
> 2. Si válido → permitir cambio de contraseña → `SET used = true` → `DEL reset:{token}` (o dejar expirar).
> 3. Si el token ya fue usado o expiró → rechazar y pedir nuevo enlace.

---

## BUCKET: notification_queue

> **HU-03** — Cola de correo al bloquear cuenta por intentos fallidos
> **HU-04** — Cola de correo de alerta por actividad sospechosa
> **HU-07** — Cola de correo con enlace de recuperación de contraseña

* Key: `notify:{uuid}` (UUID generado por el productor)
* TTL: corto (recomendado: 1 hora); se elimina al ser procesada exitosamente

```json
{
    "user_id": "ref → users._id",
    "email": "string",
    "tipo": "bloqueo | actividad_sospechosa | reset_password",
    "metadata": {
        "ip": "string",
        "dispositivo": "string",
        "user_agent": "string",
        "timestamp": "timestamp"
    },
    "intentos_envio": 0,
    "created_at": "timestamp"
}
```

> **`intentos_envio`** (agregado): el worker incrementa este campo en cada intento. Si supera el máximo configurado (ej. 3), descarta la notificación y la registra en Cassandra como fallida.
> **Worker de notificaciones:** un proceso Node.js separado (o función programada) hace `SCAN notify:*` periódicamente, lee cada key, envía el correo (Nodemailer / SendGrid) y hace `DEL notify:{uuid}` al completar. Esto desacopla el envío de correo del ciclo de request/response.
> **`user_agent`** (agregado en metadata): contexto adicional útil para el correo de alerta (HU-04), para que el usuario pueda identificar si el dispositivo le resulta familiar.
