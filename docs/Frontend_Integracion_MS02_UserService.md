# GuÃ­a de integraciÃ³n Frontend â€” MS-02 User Service

**Proyecto:** INVENTARIO INVORY  
**Ãmbito:** Consumo desde cliente web de la gestiÃ³n de usuarios  
**Ãšltima actualizaciÃ³n:** 2026-04-08

---

## 1) Objetivo

Definir el contrato para que frontend consuma el mÃ³dulo de usuarios (MS-02) de forma consistente y sin exponer datos sensibles.

Base URL local recomendada del servicio:

```text
http://localhost:3003
```

> Nota: en integraciÃ³n con gateway, estos endpoints deben publicarse bajo una ruta unificada (por ejemplo `/api/users`).

---

## 2) Endpoints disponibles

| MÃ©todo | Endpoint | Uso |
|---|---|---|
| POST | `/api/users` | Crear usuario |
| GET | `/api/users` | Listar usuarios con paginaciÃ³n y filtros |
| GET | `/api/users/:id` | Obtener detalle de usuario |
| PUT | `/api/users/:id` | ActualizaciÃ³n parcial de usuario |
| DELETE | `/api/users/:id` | Borrado lÃ³gico (deshabilitar) |

---

## 3) Contratos de request/response

## 3.1 Crear usuario

### Request

```http
POST /api/users
Content-Type: application/json

{
  "nombre": "Operador de Bodega",
  "correo": "operador@invory.test",
  "contrasena": "ClaveSegura123",
  "id_rol": 2,
  "estado": "activo"
}
```

### Response exitosa (201)

```json
{
  "success": true,
  "data": {
    "id_usuario": 10,
    "id_rol": 2,
    "nombre": "Operador de Bodega",
    "correo": "operador@invory.test",
    "estado": true,
    "fecha_creacion": "2026-04-08T20:30:00.000Z",
    "ultimo_acceso": null,
    "intentos_fallidos": 0,
    "bloqueado": false
  }
}
```

## 3.2 Listar usuarios paginados

### Request

```http
GET /api/users?page=1&size=10&estado=activo
```

### Response exitosa (200)

```json
{
  "success": true,
  "data": {
    "total": 25,
    "page": 1,
    "size": 10,
    "totalPages": 3,
    "items": [
      {
        "id_usuario": 1,
        "id_rol": 1,
        "nombre": "Administrador",
        "correo": "admin@invory.test",
        "estado": true,
        "fecha_creacion": "2026-04-01T10:00:00.000Z",
        "ultimo_acceso": null,
        "intentos_fallidos": 0,
        "bloqueado": false
      }
    ]
  }
}
```

## 3.3 ActualizaciÃ³n parcial

### Request

```http
PUT /api/users/2
Content-Type: application/json

{
  "nombre": "Operador Turno Noche",
  "estado": "inactivo"
}
```

### Response exitosa (200)

```json
{
  "success": true,
  "data": {
    "id_usuario": 2,
    "id_rol": 2,
    "nombre": "Operador Turno Noche",
    "correo": "operador@invory.test",
    "estado": false
  }
}
```

## 3.4 Borrado lÃ³gico

### Request

```http
DELETE /api/users/2
x-user-id: 1
x-user-role: Administrador
```

### Response exitosa (200)

```json
{
  "success": true,
  "data": {
    "id_usuario": 2,
    "estado": false
  }
}
```

---

## 4) Regla de negocio crÃ­tica

Si un administrador intenta deshabilitar su propio usuario, la API debe responder:

- HTTP `409`
- `error.code = "ADMIN_SELF_DISABLE_FORBIDDEN"`

Ejemplo de respuesta:

```json
{
  "success": false,
  "error": {
    "code": "ADMIN_SELF_DISABLE_FORBIDDEN",
    "message": "Un administrador no puede deshabilitarse a sÃ­ mismo"
  }
}
```

---

## 5) Recomendaciones para frontend

1. Mantener paginaciÃ³n en estado global (`page`, `size`, `estado`).
2. Normalizar respuestas de lista en un adaptador (`items`, `total`, `totalPages`).
3. Para deshabilitar usuario, mostrar confirmaciÃ³n explÃ­cita antes de llamar `DELETE`.
4. Mapear cÃ³digos de error a mensajes de UI:
   - `USER_NOT_FOUND`
   - `USER_EMAIL_ALREADY_EXISTS`
   - `VALIDATION_ERROR`
   - `ADMIN_SELF_DISABLE_FORBIDDEN`

---

## 6) Lista de verificaciÃ³n para integraciÃ³n frontend

- [ ] Alta de usuario funcional desde formulario.
- [ ] Tabla de usuarios con paginaciÃ³n real y filtro por estado.
- [ ] EdiciÃ³n parcial sin sobreescribir campos no enviados.
- [ ] Flujo de deshabilitaciÃ³n (DELETE lÃ³gico) funcionando.
- [ ] Manejo de error `ADMIN_SELF_DISABLE_FORBIDDEN` validado en UI.
- [ ] ContraseÃ±a nunca renderizada ni almacenada en estado de frontend.
