# Entidades

* User (perfil, no seguridad crítica)
* Course
* Section (estructura jerárquica)
* Content (texto, videos, documentos, imágenes)
* Evaluation
* Question + Options (embebidos)
* CourseMessage (mensajes dentro de cursos)

---

# Modelo Agregado

## COLECTION: users

* _id: user_id
* Estructure:

```json
{
    username: "string",
    password: "string", // Hasheada
    salt: "string",
    nombre_completo: "string",
    fecha_nacimiento: "date",
    avatar: "string",
    ip: "string",
    location: "string",
    created_at: "date",
}
```

---

## COLECTION: courses

* _id: course_id
* Estructure:

```json
{
    codigo: "string",
    nombre: "string",
    descripcion: "string",
    fecha_inicio: "date",
    fecha_fin: "date | null",
    foto: "string",
    publicado: true,
    docente: {
        user_id: "ref",
        nombre: "string"
    },
    created_at: "date"
}
```

---

## COLECTION: sections

* _id: section_id
* Estructure:

```json
{
    course_id: "ref",
    titulo: "string",
    parent_section_id: [{"ref | null"}], // Puede tener varios nodos hijos
    orden: 1
}
```
---

## COLECTION: contents

* _id: content_id
* Estructure:

```json
{
    section_id: "ref",
    tipo: "texto | documento | video | imagen",
    data: {
        texto: "string | null",
        url: "string | null"
    },
    created_at: "date"
}
```

---

## COLECTION: evaluations

* _id: evaluation_id
* Estructure:

```json
{
    course_id: "ref",
    titulo: "string",
    fecha_inicio: "date",
    fecha_fin: "date",
    preguntas: [
        {
            question_id: "uuid",
            enunciado: "string",
            opciones: [
                {
                    option_id: "uuid",
                    texto: "string",
                    es_correcta: true
                }
            ]
        }
    ]
}
```

---

## COLECTION: enrollments

* _id: enrollment_id
* Estructure:

```json
{
    user_id: "ref",
    course_id: "ref",
    fecha: "date"
}
```

---

## COLECTION: submissions

* _id: submission_id
* Estructure:

```json
{
    user_id: "ref",
    evaluation_id: "ref",
    fecha: "date",
    calificacion: 0,
    respuestas: [
        {
            question_id: "ref",
            option_id: "ref"
        }
    ]
}
```

---

## COLECTION: course_messages

* _id: message_id
* Estructure:

```json
{
    course_id: "ref",
    sender_id: "ref",
    contenido: "string",
    fecha: "date",
    respuesta_a: "message_id | null"
}
```
