# GuÃƒÂ­a de integraciÃƒÂ³n Frontend Ã¢â‚¬â€ MS-01 y API Gateway

**Proyecto:** INVENTARIO INVORY  
**ÃƒÂmbito:** Consumo desde cliente web de autenticaciÃƒÂ³n y rutas protegidas  
**ÃƒÅ¡ltima actualizaciÃƒÂ³n:** 2026-04-04

---

## 1) Objetivo

Definir un contrato claro para que frontend consuma autenticaciÃƒÂ³n a travÃƒÂ©s del `api-gateway`, sin acoplarse internamente al `auth-service`.

Base URL local recomendada:

```text
http://localhost:3000
```

---

## 2) Endpoints disponibles por Gateway

| MÃƒÂ©todo | Endpoint | Uso |
|---|---|---|
| POST | `/api/auth/login` | Iniciar sesiÃƒÂ³n y obtener token |
| POST | `/api/auth/logout` | Cerrar sesiÃƒÂ³n y revocar token |
| POST | `/api/auth/refresh` | Renovar token activo |
| GET | `/api/auth/verify` | Verificar token actual |
| GET | `/api/protected/ping` | Ruta protegida de prueba de integraciÃƒÂ³n |

---

## 3) Contratos de request/response

## 3.1 Login

### Request

```http
POST /api/auth/login
Content-Type: application/json

{
  "nombre_usuario": "admin",
  "contrasena": "Admin1234"
}
```

### Response exitosa (200)

```json
{
  "success": true,
  "data": {
    "token": "<jwt>",
    "id_usuario": 1,
    "nombre": "Administrador Demo",
    "rol": "Administrador",
    "expires_in": 1800
  }
}
```

### Errores frecuentes

- `401` credenciales invÃƒÂ¡lidas
- `423` cuenta bloqueada temporalmente

## 3.2 Verify

### Request

```http
GET /api/auth/verify
Authorization: Bearer <jwt>
```

### Response exitosa (200)

```json
{
  "success": true,
  "data": {
    "valid": true,
    "id_usuario": 1,
    "nombre": "Administrador Demo",
    "rol": "Administrador"
  }
}
```

## 3.3 Refresh

### Request

```http
POST /api/auth/refresh
Authorization: Bearer <jwt>
```

### Response exitosa (200)

```json
{
  "success": true,
  "data": {
    "token": "<jwt_nuevo>",
    "expires_in": 1800
  }
}
```

## 3.4 Logout

### Request

```http
POST /api/auth/logout
Authorization: Bearer <jwt>
```

### Response exitosa (200)

```json
{
  "success": true,
  "message": "Sesion cerrada correctamente"
}
```

---

## 4) Estructura recomendada de sesiÃƒÂ³n en frontend

```ts
type UsuarioSesion = {
  id_usuario: number;
  nombre: string;
  rol: 'Administrador' | 'Empleado';
};

type EstadoSesion = {
  token: string;
  expires_in: number;
  usuario: UsuarioSesion;
};
```

---

## 5) Estrategia de integraciÃƒÂ³n recomendada

1. Guardar token en un almacenamiento seguro (preferente: cookie `HttpOnly` con backend intermedio).
2. En cada solicitud protegida, enviar `Authorization: Bearer <token>`.
3. Si llega `401` por token expirado:
   - intentar `refresh` una sola vez,
   - actualizar token en memoria,
   - reintentar la solicitud original.
4. Si `refresh` falla:
   - limpiar sesiÃƒÂ³n local,
   - redirigir a login.

---

## 6) Interceptor HTTP de referencia (pseudocÃƒÂ³digo)

```ts
requestInterceptor(req) {
  const token = session.token;
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
}

responseInterceptor(error) {
  if (error.status === 401 && !error.request._retried) {
    error.request._retried = true;
    const refreshed = refreshToken();
    if (refreshed.ok) {
      updateSession(refreshed.token);
      return retry(error.request);
    }
    clearSession();
    redirectToLogin();
  }
  throw error;
}
```

---

## 7) Manejo de errores en interfaz

- `AUTH_INVALID_CREDENTIALS` Ã¢â€ â€™ mostrar "Usuario o contraseÃƒÂ±a incorrectos".
- `AUTH_ACCOUNT_BLOCKED` Ã¢â€ â€™ informar bloqueo temporal de cuenta.
- `AUTH_TOKEN_EXPIRED` Ã¢â€ â€™ renovar sesiÃƒÂ³n automÃƒÂ¡ticamente (una vez).
- `AUTH_TOKEN_REVOKED` Ã¢â€ â€™ cerrar sesiÃƒÂ³n y enviar al login.

---

## 8) Lista de verificaciÃƒÂ³n para integraciÃƒÂ³n frontend

- [ ] Login consume gateway y guarda token correctamente.
- [ ] Verify permite recuperar usuario autenticado al recargar la aplicaciÃƒÂ³n.
- [ ] Refresh se ejecuta una sola vez por expiraciÃƒÂ³n.
- [ ] Logout limpia sesiÃƒÂ³n y bloquea reutilizaciÃƒÂ³n de token.
- [ ] Rutas protegidas en frontend dependen de estado de sesiÃƒÂ³n real.

---

## 9) Recomendaciones para siguientes iteraciones

1. Incorporar endpoint de perfil (`/api/auth/me`) en gateway para simplificar inicializaciÃƒÂ³n de sesiÃƒÂ³n.
2. Agregar pruebas E2E frontend (login, navegaciÃƒÂ³n protegida, expiraciÃƒÂ³n y logout).
3. Definir polÃƒÂ­tica de expiraciÃƒÂ³n de sesiÃƒÂ³n de UI (inactividad y cierre automÃƒÂ¡tico).

