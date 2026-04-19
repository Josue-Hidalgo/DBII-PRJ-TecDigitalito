# Entidades

* LoginAttempt
* AuditLog
* SuspiciousActivity
* Historial de accesos

---

# Modelo Agregado

---

## COLUMN: access_history_by_user (Req10)

* ROW KEY: (user_id, timestamp)
* Columns:

  * "user_id": uuid,
  * "timestamp": timestamp,
  * "ip": text,
  * "dispositivo": text,
  * "tipo_acceso": text,
  * "exitoso": boolean

---

## COLUMN: suspicious_activity_by_user

* ROW KEY: (user_id, timestamp)
* Columns:

  * "user_id": uuid,
  * "timestamp": timestamp,
  * "tipo": text,
  * "descripcion": text,
  * "ip": text,
  * "dispositivo": text,