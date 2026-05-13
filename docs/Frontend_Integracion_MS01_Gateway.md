# GuÃ­a de integraciÃ³n Frontend â€” MS-01 y API Gateway

**Proyecto:** INVENTARIO INVORY  
**Ãmbito:** Consumo desde cliente web de autenticaciÃ³n y rutas protegidas  
**Ãšltima actualizaciÃ³n:** 2026-04-04

---

## 1) Objetivo

Definir un contrato claro para que frontend consuma autenticaciÃ³n a travÃ©s del `api-gateway`, sin acoplarse internamente al `auth-service`.

Base URL local recomendada:

```text
http://localhost:3000
```

---

## 2) Endpoints disponibles por Gateway

| MÃ©todo | Endpoint | Uso |
|---|---|---|
| POST | `/api/auth/login` | Iniciar sesiÃ³n y obtener token |
| POST | `/api/auth/logout` | Cerrar sesiÃ³n y revocar token |
| POST | `/api/auth/refresh` | Renovar token activo |
| GET | `/api/auth/verify` | Verificar token actual |
| GET | `/api/protected/ping` | Ruta protegida de prueba de integraciÃ³n |

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

- `401` credenciales invÃ¡lidas
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

## 4) Estructura recomendada de sesiÃ³n en frontend

```ts
type UsuarioSesion = {
  id_usuario: number;
  nombre: string;
  rol: 'Administrador' | 'Operador';
};

type EstadoSesion = {
  token: string;
  expires_in: number;
  usuario: UsuarioSesion;
};
```

---

## 5) Estrategia de integraciÃ³n recomendada

1. Guardar token en un almacenamiento seguro (preferente: cookie `HttpOnly` con backend intermedio).
2. En cada solicitud protegida, enviar `Authorization: Bearer <token>`.
3. Si llega `401` por token expirado:
   - intentar `refresh` una sola vez,
   - actualizar token en memoria,
   - reintentar la solicitud original.
4. Si `refresh` falla:
   - limpiar sesiÃ³n local,
   - redirigir a login.

---

## 6) Interceptor HTTP de referencia (pseudocÃ³digo)

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

- `AUTH_INVALID_CREDENTIALS` â†’ mostrar "Usuario o contraseÃ±a incorrectos".
- `AUTH_ACCOUNT_BLOCKED` â†’ informar bloqueo temporal de cuenta.
- `AUTH_TOKEN_EXPIRED` â†’ renovar sesiÃ³n automÃ¡ticamente (una vez).
- `AUTH_TOKEN_REVOKED` â†’ cerrar sesiÃ³n y enviar al login.

---

## 8) Lista de verificaciÃ³n para integraciÃ³n frontend

- [ ] Login consume gateway y guarda token correctamente.
- [ ] Verify permite recuperar usuario autenticado al recargar la aplicaciÃ³n.
- [ ] Refresh se ejecuta una sola vez por expiraciÃ³n.
- [ ] Logout limpia sesiÃ³n y bloquea reutilizaciÃ³n de token.
- [ ] Rutas protegidas en frontend dependen de estado de sesiÃ³n real.

---

## 9) Recomendaciones para siguientes iteraciones

1. Incorporar endpoint de perfil (`/api/auth/me`) en gateway para simplificar inicializaciÃ³n de sesiÃ³n.
2. Agregar pruebas E2E frontend (login, navegaciÃ³n protegida, expiraciÃ³n y logout).
3. Definir polÃ­tica de expiraciÃ³n de sesiÃ³n de UI (inactividad y cierre automÃ¡tico).
