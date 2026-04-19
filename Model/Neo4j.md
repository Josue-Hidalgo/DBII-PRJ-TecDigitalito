# Entidades

* User (nodo)
* Friendship (relación)
* Enrollment (relación)
* User → Course (docente)
* Interacciones sociales

---

# Modelo Agregado

## Nodos

```neo4j
(:User)
{
    user_id: "uuid",
    username: "string",
    nombre: "string",
    avatar: "string",
    created_at: "datetime"
}
```

```neo4j
(:Course)
{
    course_id: "uuid",
    codigo: "string",
    nombre: "string",
    publicado: true,
    created_at: "datetime"
}
```

---

## Relaciones

```neo4j
(:User)-[:FRIEND]->(:User)
```

```neo4j
(:User)-[:ENROLLED]->(:Course)
```

```neo4j
(:User)-[:TEACHES]->(:Course)
```

```neo4j
(:User)-[:SENT_MESSAGE]->(:User)
```

```neo4j
(:User)-[:INTERACTS_WITH]->(:User)
```