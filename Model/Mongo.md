# MongoDB — Modelo Agregado

## Justificación
MongoDB es ideal para documentos con estructura variable y relaciones de contención (curso → secciones → contenidos). Se usa para toda la lógica de negocio principal: usuarios, cursos, evaluaciones y mensajería. Su modelo de documentos embebidos evita joins costosos para las consultas más frecuentes.

## Entidades

* User (perfil, no seguridad crítica)
* Course
* Section (estructura jerárquica)
* Content (texto, videos, documentos, imágenes)
* Evaluation (con preguntas y opciones embebidas)
* Enrollment
* Submission (resultado de evaluaciones)
* CourseMessage (consultas dentro de un curso)
* DirectMessage (mensajes directos entre usuarios)

---

## COLLECTION: users

> **HU-01** — Registro de usuario
> **HU-02** — Inicio de sesión (lectura de credenciales hasheadas)
> **HU-08** — Cambio de contraseña (update de `password`, `salt`, `password_history`)
> **HU-29** — Búsqueda de usuarios (índice de texto sobre `username` y `nombre_completo`)

* `_id`: user_id (UUID)
* Índice único: `username`
* Índice de texto: `username`, `nombre_completo`

```json
{
    "_id": "uuid",
    "username": "string",
    "password": "string (bcrypt hash)",
    "salt": "string",
    "nombre_completo": "string",
    "fecha_nacimiento": "date",
    "avatar": "string (url o base64)",
    "email": "string",
    "password_history": [
        {
            "password": "string (hash anterior)",
            "changed_at": "date"
        }
    ],
    "created_at": "date",
    "updated_at": "date"
}
```

> **`email`** (agregado): necesario para enviar notificaciones de bloqueo (HU-03), actividad sospechosa (HU-04) y recuperación de contraseña (HU-07). El worker de notificaciones lo lee desde aquí.
> **`password_history`** (agregado, HU-08): guarda los últimos N hashes usados para impedir reutilización de contraseñas. La política de seguridad puede definir cuántos recordar (recomendado: últimos 5).
> **Nota:** `ip` y `location` no viven aquí — pertenecen al historial de accesos en Cassandra.

---

## COLLECTION: courses

> **HU-11** — Crear curso (docente)
> **HU-15** — Publicar curso (`publicado: true`)
> **HU-18** — Listar cursos propios del docente (índice `docente.user_id`)
> **HU-19** — Clonar curso (`original_course_id`)
> **HU-20** — Buscar cursos publicados (índice `publicado`)

* `_id`: course_id (UUID)
* Índice: `docente.user_id`, `publicado`
* Índice compuesto: `(publicado, nombre)` — para búsqueda de cursos activos

```json
{
    "_id": "uuid",
    "codigo": "string",
    "nombre": "string",
    "descripcion": "string",
    "fecha_inicio": "date",
    "fecha_fin": "date | null",
    "foto": "string (url)",
    "publicado": false,
    "estado": "borrador | activo | terminado",
    "docente": {
        "user_id": "ref → users._id",
        "nombre": "string (desnormalizado para evitar join)"
    },
    "original_course_id": "ref → courses._id | null",
    "created_at": "date",
    "updated_at": "date"
}
```

> **`estado`** (agregado, HU-18): permite que el docente distinga entre cursos en borrador, activos y terminados en su panel.
> **`original_course_id`** (HU-19): `null` si es curso original; referencia al curso fuente si fue clonado. La lógica de copia de secciones y contenidos ocurre en la capa de aplicación.
> **`fecha_fin: null`** representa cursos siempre disponibles (HU-11, criterio v).

---

## COLLECTION: sections

> **HU-12** — Agregar secciones y subtemas a un curso (árbol de profundidad arbitraria)
> **HU-23** — Ver secciones de un curso (estudiante)

* `_id`: section_id (UUID)
* Índice: `course_id`
* Índice compuesto: `(course_id, parent_section_id)` — para construir el árbol por nivel

```json
{
    "_id": "uuid",
    "course_id": "ref → courses._id",
    "titulo": "string",
    "descripcion": "string | null",
    "parent_section_id": "ref → sections._id | null",
    "orden": 1,
    "created_at": "date"
}
```

> **`parent_section_id: null`** indica sección raíz. Cualquier profundidad de árbol es posible recorriendo recursivamente este campo.
> **`descripcion`** (agregado): texto introductorio opcional por sección, útil para que el docente describa el tema antes de listar los contenidos.

---

## COLLECTION: contents

> **HU-13** — Agregar contenido a secciones (texto, documentos, videos, imágenes, en cualquier combinación)
> **HU-23** — Ver contenido de una sección (estudiante)

* `_id`: content_id (UUID)
* Índice: `section_id`

```json
{
    "_id": "uuid",
    "section_id": "ref → sections._id",
    "tipo": "texto | documento | video | imagen",
    "orden": 1,
    "data": {
        "texto": "string | null",
        "url": "string | null",
        "nombre_archivo": "string | null",
        "duracion_segundos": "number | null",
        "mime_type": "string | null"
    },
    "created_at": "date"
}
```

> **`orden`**: permite tener múltiples contenidos por sección (ej. 2 videos + texto) en un orden definido por el docente.
> **`duracion_segundos`** (agregado): relevante para videos, permite mostrar la duración antes de reproducir.
> **`mime_type`** (agregado): para documentos e imágenes, permite al frontend renderizar el ícono o visor correcto (PDF, DOCX, PNG, etc.).

---

## COLLECTION: evaluations

> **HU-14** — Crear evaluaciones con preguntas de selección única, fecha inicio y fin
> **HU-24** — Realizar evaluación (lectura de preguntas y opciones)
> **HU-25** — Ver resultados de evaluaciones

* `_id`: evaluation_id (UUID)
* Índice: `course_id`
* Índice compuesto: `(course_id, fecha_inicio, fecha_fin)` — para filtrar evaluaciones activas

```json
{
    "_id": "uuid",
    "course_id": "ref → courses._id",
    "titulo": "string",
    "descripcion": "string | null",
    "fecha_inicio": "date",
    "fecha_fin": "date",
    "visible_para_estudiante": true,
    "preguntas": [
        {
            "question_id": "uuid",
            "enunciado": "string",
            "orden": 1,
            "opciones": [
                {
                    "option_id": "uuid",
                    "texto": "string",
                    "es_correcta": false
                }
            ]
        }
    ],
    "created_at": "date",
    "updated_at": "date"
}
```

> **`visible_para_estudiante`** (agregado, HU-14 / HU-15): cuando es `false`, la evaluación existe en el sistema pero el estudiante no puede verla ni acceder a ella (ej. durante la preparación del curso). Se activa automáticamente al llegar `fecha_inicio` o manualmente por el docente.
> **`descripcion`** (agregado): instrucciones opcionales que el docente puede agregar antes del inicio.
> **`orden` por pregunta** (agregado): permite al docente definir el orden de presentación de las preguntas.
> La calificación se calcula automáticamente: `(correctas / total_preguntas) * 100`. No hay ponderación por pregunta (HU-14).

---

## COLLECTION: enrollments

> **HU-21** — Matricularse en un curso
> **HU-22** — Listar cursos matriculados (estudiante)
> **HU-16** — Listar estudiantes matriculados (docente)
> **HU-27** — Ver compañeros de curso

* `_id`: enrollment_id (UUID)
* Índice compuesto único: `(user_id, course_id)` — previene matrículas duplicadas
* Índice: `course_id` — para listar estudiantes de un curso (HU-16)

```json
{
    "_id": "uuid",
    "user_id": "ref → users._id",
    "course_id": "ref → courses._id",
    "fecha": "date",
    "estado": "activo | completado | abandonado"
}
```

> **`estado`** (agregado): permite que el sistema distinga entre estudiantes activos y aquellos que completaron o abandonaron el curso, útil para el panel del docente (HU-16).

---

## COLLECTION: submissions

> **HU-24** — Realizar evaluación y obtener resultado inmediato
> **HU-25** — Ver historial de resultados de todas las evaluaciones de un curso

* `_id`: submission_id (UUID)
* Índice: `(user_id, course_id)` — para HU-25: todas las evaluaciones del estudiante en un curso
* Índice: `(user_id, evaluation_id)` — unicidad por intento (si solo se permite un intento)

```json
{
    "_id": "uuid",
    "user_id": "ref → users._id",
    "evaluation_id": "ref → evaluations._id",
    "course_id": "ref → courses._id",
    "fecha": "date",
    "calificacion": 85.0,
    "total_preguntas": 10,
    "correctas": 7,
    "respuestas": [
        {
            "question_id": "ref → evaluations.preguntas.question_id",
            "option_id": "ref → evaluations.preguntas.opciones.option_id",
            "es_correcta": true
        }
    ]
}
```

> **`course_id`** desnormalizado: evita hacer join con `evaluations` para consultar todas las notas de un estudiante en un curso (HU-25).
> **`total_preguntas` / `correctas`**: calculados y guardados en el momento del submit para mostrar el resultado inmediatamente sin recalcular (HU-24).
> **`es_correcta` por respuesta**: permite mostrar retroalimentación detallada al estudiante después de entregar.

---

## COLLECTION: course_messages

> **HU-17** — Docente recibe y responde consultas de estudiantes
> **HU-26** — Estudiante envía consultas al docente

* `_id`: message_id (UUID)
* Índice: `course_id` — para listar todas las consultas de un curso (vista docente)
* Índice compuesto: `(course_id, sender_id)` — para filtrar mensajes por estudiante

```json
{
    "_id": "uuid",
    "course_id": "ref → courses._id",
    "sender_id": "ref → users._id",
    "sender_nombre": "string (desnormalizado)",
    "tipo": "consulta | respuesta",
    "contenido": "string",
    "fecha": "date",
    "respuesta_a": "ref → course_messages._id | null",
    "leido": false
}
```

> **`tipo`**: diferencia si el mensaje es una consulta del estudiante o una respuesta del docente. El threading se construye con `respuesta_a`.
> **`leido`**: permite que el docente identifique qué consultas no ha atendido aún.
> **`sender_nombre`** (agregado): desnormalizado para evitar join al renderizar la lista de mensajes.

---

## COLLECTION: direct_messages

> **HU-30** — Enviar y responder mensajes directos entre cualquier par de usuarios

* `_id`: message_id (UUID)
* Índice compuesto: `(sender_id, receiver_id)` — conversación entre dos usuarios
* Índice: `receiver_id` — para bandeja de entrada del receptor

```json
{
    "_id": "uuid",
    "sender_id": "ref → users._id",
    "receiver_id": "ref → users._id",
    "sender_nombre": "string (desnormalizado)",
    "contenido": "string",
    "fecha": "date",
    "respuesta_a": "ref → direct_messages._id | null",
    "leido": false
}
```

> El threading se maneja con `respuesta_a`, igual que en `course_messages`.
> **`sender_nombre`** (agregado): desnormalizado para evitar join en la bandeja de entrada.
> La relación social entre los dos usuarios (para el grafo de amistades) se gestiona en Neo4j; este documento solo almacena el contenido del mensaje.
