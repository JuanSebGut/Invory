# Informe de Comunicacion Entre Capas - INVORY

## 1) Objetivo

Este informe describe, de extremo a extremo, como se comunican las tres capas principales del sistema INVORY:

- Capa de presentacion: `frontend` (React + Vite)
- Capa de servicios: `api-gateway` + microservicios backend
- Capa de datos: PostgreSQL

Se detalla el flujo tecnico, protocolos, contratos, seguridad y patrones de error entre capas.

## 2) Vista general de comunicacion

Arquitectura de alto nivel:

1. El usuario interactua con el frontend React.
2. El frontend realiza solicitudes HTTP al API Gateway.
3. El API Gateway valida seguridad (JWT y roles) y reenvia al microservicio destino.
4. El microservicio ejecuta reglas de negocio y consulta/actualiza PostgreSQL.
5. La respuesta vuelve al Gateway y luego al frontend.

En paralelo, algunos microservicios envian eventos de auditoria hacia `audit-service` por webhook HTTP.

## 3) Comunicacion Frontend -> Backend

## 3.1 Mecanismo tecnico

- Protocolo: HTTP/JSON
- Cliente: `fetch` desde modulos `frontend/src/api/*.js`
- Base API en frontend:
  - `VITE_API_URL` si existe
  - fallback a `/api`
- En desarrollo local, Vite proxy redirige `/api` a `http://localhost:3000` (API Gateway).

Consecuencia: el frontend **no habla directamente con cada microservicio**, sino con el Gateway como punto unico.

## 3.2 Rutas funcionales consumidas por frontend

El frontend consume dominios via gateway:

- `/api/auth/*`
- `/api/users/*`
- `/api/categories/*`
- `/api/products/*`
- `/api/providers/*`
- `/api/inventory/*`
- `/api/audit/*`
- `/api/export`

## 3.3 Autenticacion en la capa cliente

- Tras login exitoso, se guarda JWT en `localStorage` (`invory_token`).
- En endpoints protegidos, frontend envia `Authorization: Bearer <token>`.
- El contexto de autenticacion (`AuthContext`) mantiene estado de sesion y rol del usuario.

## 4) Comunicacion dentro del Backend (Gateway <-> Microservicios)

## 4.1 Patron de integracion

El Gateway aplica un patron de **reverse proxy con policy enforcement**:

- recibe request del frontend
- valida JWT (via `auth-service`)
- valida rol segun ruta/operacion
- reenvia solicitud al microservicio target
- normaliza y retorna respuesta al frontend

## 4.2 Ruteo por dominio

Mapa principal:

- Auth -> `auth-service` (3002)
- Users -> `user-service` (3004)
- Categories -> `category-service` (3003)
- Products -> `product-service` (3001)
- Providers -> `supplier-service` (3008)
- Inventory -> `inventory-service` (3005)
- Audit -> `audit-service` (3006)
- Export -> `export-service` (3007)

## 4.3 Propagacion de identidad

Ademas del token, el Gateway reenvia headers internos de contexto cuando aplica:

- `x-user-id`
- `x-user-role`
- `x-user-name`

Esto permite que microservicios downstream registren auditoria o reglas de negocio sin volver a reconstruir contexto completo manualmente.

## 4.4 Modelo de seguridad

- Validacion de token: centralizada con `auth-service`.
- Autorizacion por rol: guards en el gateway y refuerzo en servicios sensibles.
- Roles operativos:
  - `Administrador`
  - `Empleado`

## 4.5 Flujos especiales backend-backend

### Auditoria por webhook

Servicios como `auth-service`, `user-service` e `inventory-service` emiten eventos hacia:

- `POST /api/audit/events` en `audit-service`

Objetivo: trazabilidad de acciones criticas sin acoplar la operacion principal al frontend.

### Exportaciones

`export-service` integra datos de varias fuentes y devuelve archivo binario (PDF/Excel), manteniendo la descarga a traves del Gateway.

## 5) Comunicacion Backend -> Base de Datos

## 5.1 Mecanismo tecnico

- Motor: PostgreSQL
- Driver Node: `pg`
- Conexion via variables (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)

Cada microservicio que persiste datos abre su propia capa de acceso a DB (repositorios/modelos).

## 5.2 Patron de acceso

- Los servicios encapsulan SQL en repositorios/servicios de dominio.
- Operaciones CRUD y consultas filtradas se ejecutan segun contexto de negocio.
- Integridad fuerte por constraints, FK, checks e indices en DB.

## 5.3 Reglas automaticas en DB que impactan comunicacion

- Triggers de inventario ajustan stock al insertar movimientos.
- Restriccion de no borrado de movimientos en capa DB.
- Esto implica que el backend recibe errores/control de integridad directamente del motor cuando una operacion viola reglas.

## 6) Trazado end-to-end de casos representativos

## 6.1 Login

1. Frontend -> `POST /api/auth/login` (Gateway)
2. Gateway -> `auth-service`
3. `auth-service` valida en DB, emite JWT
4. Respuesta vuelve al frontend
5. Frontend guarda token y habilita rutas privadas

## 6.2 Registrar movimiento de inventario

1. Frontend -> `POST /api/inventory/movements` + Bearer token
2. Gateway valida token/rol y proxea a `inventory-service`
3. `inventory-service` valida reglas, persiste en DB
4. Trigger DB calcula stock_posterior y actualiza `productos.stock_actual`
5. `inventory-service` dispara webhook de auditoria
6. Resultado vuelve al frontend

## 6.3 Exportar reporte

1. Frontend (Administrador) -> `POST /api/export`
2. Gateway valida rol `EXPORTAR_DATOS` y proxea a `export-service`
3. `export-service` compone dataset (DB + otros servicios)
4. Genera archivo temporal y responde stream binario
5. Gateway retransmite headers de descarga al frontend
6. Frontend descarga blob

## 7) Manejo de errores entre capas

## 7.1 Tipos frecuentes

- `401 Unauthorized`: token invalido o ausente
- `403 Forbidden`: rol sin permisos
- `404 Not Found`: recurso inexistente
- `409 Conflict`/`400`: validaciones de dominio o constraints
- `502 Bad Gateway`: caida o indisponibilidad de servicio downstream

## 7.2 Propagacion

- Microservicio genera error de negocio/infraestructura.
- Gateway traduce o reexpone estado y payload.
- Frontend transforma error en mensajes de UX.

## 8) Comunicacion en entorno local y Docker

## 8.1 Local (dev)

- Frontend: `http://localhost:5173`
- Proxy Vite: `/api` -> `http://localhost:3000`
- Gateway enruta a servicios `localhost:3001..3008` segun config.

## 8.2 Docker Compose

- Comunicacion interna por nombre de servicio (`http://auth-service:3002`, etc.).
- PostgreSQL accesible internamente como `postgres:5432`.
- Exposicion host: PostgreSQL `5433`, Gateway `3000`, servicios `3001..3008`.

## 9) Fortalezas de la comunicacion por capas

- Desacoplamiento frontend/microservicios gracias al Gateway.
- Control de seguridad consistente (token + rol) en punto central.
- Trazabilidad transversal por integracion con auditoria.
- Escalabilidad por dominio de negocio.

## 10) Riesgos tecnicos y recomendaciones

1. Dependencia alta del `auth-service`: si cae, afecta autorizacion global.
2. Eventos por webhook sin cola pueden perderse en fallas de red; evaluar reintentos robustos o cola de eventos.
3. Estandarizar contratos de error JSON entre servicios para UX mas uniforme.
4. Mantener observabilidad (logs correlacionados por request-id) para depuracion end-to-end.

## 11) Conclusiones

La comunicacion de INVORY entre frontend, backend y base de datos sigue una topologia limpia: cliente desacoplado, gateway central de seguridad/orquestacion, y microservicios especializados con persistencia relacional robusta. El modelo actual es solido para operacion empresarial y puede evolucionar hacia mayor resiliencia con patrones de mensajeria y observabilidad avanzada.
