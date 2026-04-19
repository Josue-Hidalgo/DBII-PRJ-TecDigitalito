# Neo4j — Modelo Agregado

## Justificación
Neo4j se usa para modelar las relaciones sociales y de participación de la plataforma: amistades, matrículas y docencias. Su modelo de grafo hace que consultas como "¿qué cursos lleva mi amigo?" o "¿quiénes son mis compañeros de curso?" sean naturales y eficientes, sin joins costosos. También registra la existencia de mensajes directos para navegación por el grafo social.

## Entidades

* `(:User)` — nodo usuario (datos mínimos para navegación social)
* `(:Course)` — nodo curso (datos mínimos para búsqueda y visibilidad)
* `[:FRIEND]` — relación de amistad bidireccional
* `[:ENROLLED]` — relación estudiante → curso
* `[:TEACHES]` — relación docente → curso
* `[:SENT_MESSAGE]` — relación de mensaje directo entre usuarios
* `[:INTERACTS_WITH]` — interacción general (base para recomendaciones futuras)

---

## Nodos

### (:User)

> **HU-01** — Se crea el nodo al registrar el usuario (duplica datos mínimos de MongoDB para evitar joins cross-DB)
> **HU-27** — Compañeros de curso: se consultan nodos `:User` conectados al mismo `:Course`
> **HU-28** — Amistad: se crea/consulta la relación `[:FRIEND]` entre dos nodos `:User`
> **HU-29** — Búsqueda de usuarios por nombre o username (índice full-text)

```cypher
(:User {
    user_id:    "uuid",          // mismo _id que en MongoDB users
    username:   "string",
    nombre:     "string",
    avatar:     "string (url)",
    created_at: "datetime"
})
```

* Índice único: `user_id`, `username`
* Índice full-text: `username`, `nombre` — para búsqueda con `CONTAINS` o `db.index.fulltext` (HU-29)

> Solo se almacenan los campos necesarios para navegación social. El perfil completo (fecha_nacimiento, email, password) vive en MongoDB.

---

### (:Course)

> **HU-11** — Se crea el nodo al publicar el curso (o al crearlo, para poder asociar la relación TEACHES)
> **HU-15** — `publicado: true` se activa al publicar; cursos no publicados no aparecen en búsquedas sociales
> **HU-20** — Búsqueda de cursos publicados (filtro `publicado: true`)
> **HU-28** — Ver cursos de un amigo: se navegan relaciones `ENROLLED|TEACHES` del amigo

```cypher
(:Course {
    course_id:  "uuid",          // mismo _id que en MongoDB courses
    codigo:     "string",
    nombre:     "string",
    publicado:  false,
    estado:     "borrador | activo | terminado",
    created_at: "datetime"
})
```

* Índice único: `course_id`

> **`estado`** (agregado): permite al grafo saber si un curso está activo o terminado, útil para filtrar la vista de "cursos que lleva un amigo" (HU-28) sin cruzar a MongoDB.

---

## Relaciones

### [:FRIEND] — Amistad

> **HU-28** — Como usuario puedo hacerme amigo de otro usuario y ver sus cursos

```cypher
(:User)-[:FRIEND {
    desde:   "datetime",
    estado:  "pendiente | aceptada"
}]->(:User)
```

> **`estado`** (agregado): modela la solicitud de amistad (pendiente) antes de ser aceptada. Hasta que `estado = 'aceptada'` la relación no habilita la visibilidad de cursos.
> La relación se crea en ambas direcciones o se usa sin dirección en las consultas (`-[:FRIEND]-`) para amistad bidireccional.

---

### [:ENROLLED] — Matrícula

> **HU-21** — Matricularse en un curso
> **HU-22** — Listar cursos en los que estoy matriculado
> **HU-27** — Ver compañeros de curso (otros usuarios con relación ENROLLED al mismo Course)
> **HU-28** — Ver cursos que un amigo ha llevado

```cypher
(:User)-[:ENROLLED {
    fecha:  "datetime",
    estado: "activo | completado | abandonado"
}]->(:Course)
```

> **`estado`** (agregado): consistente con el campo en MongoDB `enrollments`. Permite filtrar en el grafo si un amigo está actualmente llevando el curso o ya lo terminó (HU-28).

---

### [:TEACHES] — Docencia

> **HU-11** — Al crear un curso, el usuario pasa a ser docente del mismo
> **HU-18** — Listar cursos que imparto como docente
> **HU-28** — Ver en qué cursos es docente un amigo

```cypher
(:User)-[:TEACHES {
    desde: "datetime"
}]->(:Course)
```

---

### [:SENT_MESSAGE] — Mensaje directo

> **HU-30** — Enviar mensajes directos entre usuarios; la relación registra que existe una conversación entre ambos

```cypher
(:User)-[:SENT_MESSAGE {
    message_id:  "uuid",         // referencia al documento en MongoDB direct_messages
    fecha:       "datetime",
    preview:     "string (primeros ~60 chars del mensaje)"
}]->(:User)
```

> El contenido completo del mensaje vive en MongoDB (`direct_messages`). Esta relación en Neo4j solo registra la existencia de la conversación para facilitar la navegación social y mostrar "con quién he hablado" sin consultar MongoDB.
> **`preview`**: permite mostrar un snippet del último mensaje en la lista de conversaciones sin ir a MongoDB.

---

### [:INTERACTS_WITH] — Interacción general

> Base para recomendaciones futuras (ej. "cursos que podrían interesarte según tus interacciones")

```cypher
(:User)-[:INTERACTS_WITH {
    tipo:  "visita_curso | busqueda | mensaje",
    fecha: "datetime",
    peso:  1
}]->(:User)
```

> No corresponde a una HU específica actual; es infraestructura para análisis de grafo o recomendaciones.

---

## Consultas de ejemplo

```cypher
// HU-21: Matricular estudiante en un curso
MATCH (u:User {user_id: $user_id}), (c:Course {course_id: $course_id})
CREATE (u)-[:ENROLLED { fecha: datetime(), estado: 'activo' }]->(c)

// HU-22: Listar cursos en los que estoy matriculado
MATCH (u:User {user_id: $user_id})-[e:ENROLLED]->(c:Course)
RETURN c.course_id, c.nombre, c.codigo, c.estado, e.fecha, e.estado
ORDER BY e.fecha DESC

// HU-27: Ver compañeros de curso
MATCH (yo:User {user_id: $user_id})-[:ENROLLED]->(c:Course {course_id: $course_id})
MATCH (compañero:User)-[:ENROLLED]->(c)
WHERE compañero.user_id <> $user_id
RETURN compañero.user_id, compañero.username, compañero.nombre, compañero.avatar

// HU-28: Enviar solicitud de amistad
MATCH (a:User {user_id: $mi_id}), (b:User {user_id: $otro_id})
CREATE (a)-[:FRIEND { desde: datetime(), estado: 'pendiente' }]->(b)

// HU-28: Aceptar solicitud de amistad
MATCH (a:User {user_id: $otro_id})-[r:FRIEND]->(b:User {user_id: $mi_id})
SET r.estado = 'aceptada'

// HU-28: Ver cursos que un amigo ha llevado o imparte (no incluye notas)
MATCH (yo:User {user_id: $mi_id})-[:FRIEND { estado: 'aceptada' }]-(amigo:User {user_id: $amigo_id})
MATCH (amigo)-[r:ENROLLED|TEACHES]->(c:Course)
WHERE c.publicado = true
RETURN type(r) AS rol, c.course_id, c.nombre, c.codigo, c.estado
ORDER BY c.created_at DESC

// HU-29: Buscar usuarios por nombre o username
MATCH (u:User)
WHERE u.username CONTAINS $query OR u.nombre CONTAINS $query
RETURN u.user_id, u.username, u.nombre, u.avatar
ORDER BY u.username ASC
LIMIT 20

// HU-30: Ver lista de conversaciones del usuario
MATCH (yo:User {user_id: $user_id})-[m:SENT_MESSAGE]-(otro:User)
RETURN DISTINCT otro.user_id, otro.username, otro.avatar, m.preview, m.fecha
ORDER BY m.fecha DESC

// HU-18: Listar todos los cursos que imparto como docente
MATCH (u:User {user_id: $user_id})-[:TEACHES]->(c:Course)
RETURN c.course_id, c.nombre, c.estado
ORDER BY c.created_at DESC
```
