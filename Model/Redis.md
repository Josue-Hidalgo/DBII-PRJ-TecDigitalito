# Entidades

* Session (tokens activos)
* Cookies “remember me”
* Contador de intentos fallidos (temporal)
* Bloqueos temporales (TTL)
* PasswordResetToken (con expiración)

---

# Modelo Agregado

## BUCKET: sessions

* Key: session:{session_id}
* Value:

```json
{
    user_id: "ref",
    token: "string",
    created_at: "timestamp",
    expires_at: "timestamp"
}
```

---

## BUCKET: remember_me

* Key: remember:{user_id}
* Value:

```json
{
    token: "string",
    created_at: "timestamp",
    expires_at: "timestamp"
}
```

---

## BUCKET: login_attempts

* Key: attempts:{user_id}
* Value:

```json
{
    attempts: 5,
    last_attempt: "timestamp"
}
```

---

## BUCKET: user_blocks

* Key: block:{user_id}
* Value:

```json
{
    blocked: true,
    blocked_at: "timestamp",
    expires_at: "timestamp"
}
```

---

## BUCKET: password_reset_tokens

* Key: reset:{token}
* Value:

```json
{
    user_id: "ref",
    created_at: "timestamp",
    expires_at: "timestamp",
    used: false
}
```