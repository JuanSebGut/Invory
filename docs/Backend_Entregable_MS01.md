# Entregable Backend MS-01 â€” Servicio de AutenticaciÃ³n y SesiÃ³n

**Proyecto:** INVENTARIO INVORY  
**MÃ³dulo principal:** MS-01 (Auth Service)  
**Integraciones incluidas:** API Gateway + Shared Utils  
**Fecha:** 2026-04-04

---

## 1. Alcance del entregable

Este entregable consolida el backend del flujo de autenticaciÃ³n del sistema e incorpora trabajo colaborativo del equipo en tres Ã¡reas:

1. **MS-01 Auth Service** (`services/auth-service`)  
2. **API Gateway** (`api-gateway`)  
3. **Shared Utils** (`shared`) para utilidades y convenciones comunes

El objetivo es dejar un bloque backend verificable para login, validaciÃ³n de token, cierre de sesiÃ³n y renovaciÃ³n de token, con pruebas automatizadas y guÃ­as operativas.

---

## 2. Componentes incluidos

## 2.1 Auth Service (MS-01)

**Endpoints implementados:**

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `GET /api/auth/verify`

**Capacidades implementadas:**

- ValidaciÃ³n de credenciales.
- GeneraciÃ³n y validaciÃ³n de JWT.
- Bloqueo de cuenta por intentos fallidos.
- RevocaciÃ³n de token en logout.
- RevocaciÃ³n de token previo en refresh.

## 2.2 API Gateway

**Responsabilidad:** puerta de entrada para consumo de frontend y rutas protegidas.

**Endpoints expuestos:**

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `GET /api/auth/verify`
- `GET /api/protected/ping` (ruta protegida de verificaciÃ³n)

El gateway delega validaciÃ³n de token hacia `auth-service` con `/api/auth/verify`.

## 2.3 Shared Utils (trabajo de rama dedicada)

Se incorporan utilidades compartidas de backend:

- `shared/constants/roles.js`
- `shared/middlewares/errorHandler.js`
- `shared/utils/jwt.js`
- `shared/utils/response.js`

Estas utilidades quedan disponibles para unificar manejo de roles, errores y respuestas entre microservicios en siguientes iteraciones.

---

## 3. Estructura de carpetas relevante

```text
invory1/
â”œâ”€ api-gateway/
â”‚  â”œâ”€ src/
â”‚  â”‚  â”œâ”€ app.js
â”‚  â”‚  â”œâ”€ config/services.js
â”‚  â”‚  â”œâ”€ middlewares/auth.middleware.js
â”‚  â”‚  â””â”€ routes/auth.routes.js
â”‚  â””â”€ tests/gateway-auth.integration.test.js
â”œâ”€ services/
â”‚  â””â”€ auth-service/
â”‚     â”œâ”€ src/
â”‚     â”‚  â”œâ”€ app.js
â”‚     â”‚  â”œâ”€ config/db.js
â”‚     â”‚  â”œâ”€ controllers/auth.controller.js
â”‚     â”‚  â”œâ”€ models/auth.model.js
â”‚     â”‚  â”œâ”€ repositories/auth.repository.js
â”‚     â”‚  â”œâ”€ routes/auth.routes.js
â”‚     â”‚  â””â”€ services/auth.service.js
â”‚     â””â”€ tests/auth.integration.test.js
â”œâ”€ shared/
â”‚  â”œâ”€ constants/roles.js
â”‚  â”œâ”€ middlewares/errorHandler.js
â”‚  â””â”€ utils/{jwt.js,response.js}
â””â”€ docs/
   â”œâ”€ QA_Guia_Verificacion_MS01_Gateway.md
   â””â”€ Frontend_Integracion_MS01_Gateway.md
```

---

## 4. Variables de entorno

Para evitar exponer configuraciÃ³n sensible, se incluyen archivos de ejemplo:

- `services/auth-service/.env.example`
- `api-gateway/.env.example`

Copiar cada uno a `.env` segÃºn el servicio antes de ejecuciÃ³n local.

---

## 5. EjecuciÃ³n local

## 5.1 InstalaciÃ³n de dependencias

```bash
npm run setup:deps
```

## 5.2 VerificaciÃ³n automÃ¡tica integral

```bash
npm run verify:all
```

Resultado esperado:

- Auth Service: 5 pruebas aprobadas.
- API Gateway: 3 pruebas aprobadas.

---

## 6. Cobertura de pruebas incluidas

## 6.1 Auth Service

- Login exitoso.
- Bloqueo por 3 intentos fallidos.
- Verify de token vÃ¡lido.
- Logout revoca token.
- Refresh emite nuevo token e invalida el anterior.

## 6.2 API Gateway

- Acceso protegido con token vÃ¡lido.
- Rechazo sin token (`401`).
- Rechazo de token revocado (`401`).

---

## 7. AlineaciÃ³n con requisitos MS-01

Cumplimientos principales:

- AutenticaciÃ³n por `nombre_usuario` y `contrasena`.
- EmisiÃ³n y verificaciÃ³n de JWT.
- Bloqueo temporal por intentos fallidos.
- Cierre de sesiÃ³n seguro con revocaciÃ³n.
- RenovaciÃ³n de token.
- Flujo probado para integraciÃ³n con gateway.

---

## 8. Entregables documentales complementarios

- `MS-01_Reporte_Tecnico_Integracion.md`
- `docs/QA_Guia_Verificacion_MS01_Gateway.md`
- `docs/Frontend_Integracion_MS01_Gateway.md`

Estos documentos cubren contrato tÃ©cnico, validaciÃ³n QA y guÃ­a de consumo desde frontend.

---

## 9. Recomendaciones para siguiente sprint

1. Unificar consumo de `shared/utils/*` en todos los microservicios.
2. Integrar MS-02 (usuarios) y MS-09 (auditorÃ­a) en modo no simulado.
3. AÃ±adir pruebas end-to-end con frontend real.
4. Estandarizar formato final de errores (`code`, `message`) en todos los mÃ³dulos.
