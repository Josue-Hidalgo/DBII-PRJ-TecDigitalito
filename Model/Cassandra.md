# Cassandra — Modelo Agregado

## Justificación
Cassandra se usa para todas las tablas de escritura intensiva que requieren consultas por rango de tiempo y alta disponibilidad: intentos de login, auditoría de acciones, actividad sospechosa e historial de accesos. Su modelo orientado a consultas (una tabla por patrón de acceso) y su escalabilidad horizontal lo hacen ideal para logs que crecen indefinidamente. Se corre en un clúster de al menos 3 nodos.

## Entidades

* `login_attempts_by_user` — intentos de login por usuario
* `login_attempts_by_ip` — intentos de login por IP (detección de fuerza bruta)
* `suspicious_activity_by_user` — actividad anormal registrada por usuario
* `access_history_by_user` — historial de accesos exitosos y fallidos (panel admin)
* `audit_logs_by_user` — auditoría de todas las acciones por usuario (punto extra)
* `audit_logs_by_date` — auditoría global por fecha (vista admin global, punto extra)

---

## TABLE: login_attempts_by_user

> **HU-02** — Inicio de sesión: cada intento (exitoso o fallido) se registra aquí
> **HU-10** — Actividad del sistema: el administrador puede ver intentos por usuario
> **HU-04** — Detección de actividad sospechosa: muchos fallos seguidos del mismo usuario

* Consulta principal: "Dame todos los intentos de login de un usuario, del más reciente al más antiguo"
* Partition key: `user_id`
* Clustering column: `timestamp DESC`

```cql
CREATE TABLE login_attempts_by_user (
    user_id      uuid,
    timestamp    timestamp,
    ip           text,
    dispositivo  text,
    user_agent   text,
    exitoso      boolean,
    location     text,
    motivo_fallo text,    -- 'credenciales_invalidas' | 'cuenta_bloqueada' | null si exitoso
    PRIMARY KEY (user_id, timestamp)
) WITH CLUSTERING ORDER BY (timestamp DESC);
```

> **`user_agent`** (agregado): junto con `ip` y `dispositivo`, permite identificar si el acceso viene de un contexto nuevo (HU-04).
> **`motivo_fallo`** (agregado): facilita distinguir en el historial si el fallo fue por credenciales incorrectas o porque la cuenta ya estaba bloqueada.
> Esta tabla se escribe en cada intento de login; Redis lleva el contador en tiempo real para el bloqueo (HU-03), pero Cassandra conserva el historial permanente.

---

## TABLE: login_attempts_by_ip

> **HU-04** — Actividad sospechosa: detectar ataques de fuerza bruta distribuidos desde una misma IP hacia distintos usuarios
> **HU-10** — El administrador puede investigar una IP concreta

* Consulta principal: "Dame todos los intentos de login desde una IP, del más reciente al más antiguo"
* Partition key: `ip`
* Clustering column: `timestamp DESC`

```cql
CREATE TABLE login_attempts_by_ip (
    ip           text,
    timestamp    timestamp,
    user_id      uuid,
    dispositivo  text,
    user_agent   text,
    exitoso      boolean,
    location     text,
    PRIMARY KEY (ip, timestamp)
) WITH CLUSTERING ORDER BY (timestamp DESC);
```

> Esta tabla es espejo de `login_attempts_by_user` pero particionada por IP. Ambas se escriben en la misma operación (batch) para mantener consistencia.
> **Criterio de detección de ataque por IP:** si en los últimos 10 minutos hay más de N intentos fallidos desde la misma IP hacia distintos `user_id`, se considera ataque de fuerza bruta distribuida → crear entrada en `suspicious_activity_by_user` para cada usuario afectado.

---

## TABLE: suspicious_activity_by_user

> **HU-04** — Actividad sospechosa: registrar y notificar accesos anormales al usuario

* Consulta principal: "Dame la actividad sospechosa de un usuario, más reciente primero"
* Partition key: `user_id`
* Clustering column: `timestamp DESC`

```cql
CREATE TABLE suspicious_activity_by_user (
    user_id      uuid,
    timestamp    timestamp,
    tipo         text,
    descripcion  text,
    ip           text,
    dispositivo  text,
    user_agent   text,
    notificado   boolean,
    resuelto     boolean,
    PRIMARY KEY (user_id, timestamp)
) WITH CLUSTERING ORDER BY (timestamp DESC);
```

> **`tipo`** — valores posibles y sus criterios de detección:
> * `login_nueva_ip`: el usuario se autenticó desde una IP que nunca había usado antes.
> * `login_nuevo_dispositivo`: user-agent o dispositivo no visto previamente en el historial del usuario.
> * `multiples_fallos`: 3+ intentos fallidos seguidos (umbral previo al bloqueo total de HU-03).
> * `fuerza_bruta_ip`: la IP del intento aparece en `login_attempts_by_ip` con N fallos en la ventana de tiempo.
> * `sesion_concurrente`: se detectó login desde una segunda ubicación mientras hay sesión activa.
>
> **`resuelto`** (agregado): permite que el admin o el propio usuario marque la actividad como revisada, limpiando el panel de alertas.
> **`notificado`** (HU-04): se pone `true` tras encolar el correo en Redis `notification_queue`.

---

## TABLE: access_history_by_user

> **HU-10** — Administrador ve registro de inicios y cierres de sesión: IP, fecha, hora, dispositivo, resultado

* Consulta principal: "Dame el historial completo de accesos de un usuario para el panel admin"
* Partition key: `user_id`
* Clustering column: `timestamp DESC`

```cql
CREATE TABLE access_history_by_user (
    user_id      uuid,
    timestamp    timestamp,
    ip           text,
    dispositivo  text,
    user_agent   text,
    tipo_acceso  text,    -- 'login' | 'logout' | 'session_expired' | 'remember_me'
    resultado    text,    -- 'exitoso' | 'fallido' | 'bloqueado'
    location     text,
    PRIMARY KEY (user_id, timestamp)
) WITH CLUSTERING ORDER BY (timestamp DESC);
```

> **`tipo_acceso`** — cubre todos los eventos de sesión requeridos por HU-10:
> * `login`: intento de inicio de sesión.
> * `logout`: cierre de sesión manual (HU-05).
> * `session_expired`: sesión expirada por TTL en Redis.
> * `remember_me`: sesión restaurada desde cookie (HU-06).
>
> **`location`** (agregado): ciudad/país derivado de la IP vía geolocalización, para facilitar la lectura del historial por el admin.

---

## TABLE: audit_logs_by_user

> **HU-10** — Registro de actividad del sistema por usuario
> **Punto extra — Audit:** historial completo de todas las operaciones que hace un usuario: timestamp, acción, entidad afectada, resultado

* Consulta principal: "Dame el historial de todas las acciones de un usuario, del más reciente al más antiguo"
* Partition key: `user_id`
* Clustering column: `timestamp DESC`

```cql
CREATE TABLE audit_logs_by_user (
    user_id      uuid,
    timestamp    timestamp,
    accion       text,      -- ver valores abajo
    entidad      text,      -- 'course' | 'section' | 'evaluation' | 'enrollment' | 'user' | ...
    entidad_id   uuid,
    detalle      text,      -- JSON con campos cambiados (antes/después)
    ip           text,
    resultado    text,      -- 'ok' | 'error' | 'denegado'
    PRIMARY KEY (user_id, timestamp)
) WITH CLUSTERING ORDER BY (timestamp DESC);
```

> **Valores de `accion`** que deben auditarse:
> * Autenticación: `login`, `logout`, `login_fallido`, `password_reset`, `password_changed`
> * Cursos: `course_created`, `course_updated`, `course_published`, `course_cloned`, `course_deleted`
> * Contenido: `section_created`, `content_added`, `evaluation_created`
> * Matrículas: `enrollment_created`, `enrollment_cancelled`
> * Social: `friend_request_sent`, `friend_request_accepted`, `message_sent`
>
> **`detalle`** como JSON: para operaciones de update, guardar `{ "campo": { "antes": "valor_viejo", "despues": "valor_nuevo" } }` permite ver exactamente qué cambió.

---

## TABLE: audit_logs_by_date

> **Punto extra — Audit:** vista de administrador global para ver todos los eventos del sistema en un rango de fechas

* Consulta principal: "Dame todos los eventos de auditoría del sistema entre la fecha A y la fecha B"
* Partition key: `fecha` (date — truncado a día para controlar el tamaño de partición)
* Clustering column: `timestamp DESC`

```cql
CREATE TABLE audit_logs_by_date (
    fecha        date,
    timestamp    timestamp,
    user_id      uuid,
    accion       text,
    entidad      text,
    entidad_id   uuid,
    detalle      text,
    ip           text,
    resultado    text,
    PRIMARY KEY (fecha, timestamp)
) WITH CLUSTERING ORDER BY (timestamp DESC);
```

> Esta tabla se escribe en batch junto con `audit_logs_by_user` (misma operación) para garantizar consistencia entre ambas vistas.
> **Control de tamaño de partición:** particionando por día, cada partición contiene solo los eventos de una jornada. Para plataformas con mucha actividad, considerar partición por hora (`fecha_hora: timestamp truncado a hora`).
> Permite al administrador consultar rangos: `WHERE fecha >= '2025-01-01' AND fecha <= '2025-01-31'` usando múltiples queries por fecha o un `IN (date1, date2, ...)`.
