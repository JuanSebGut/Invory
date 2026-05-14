# INVORY

Plataforma de gestion de inventario con arquitectura de microservicios, API Gateway, frontend en React y base de datos PostgreSQL.

## Arquitectura

- `frontend`: SPA React + Vite.
- `api-gateway`: punto unico de entrada para el frontend.
- `services/auth-service` (MS-01): autenticacion y sesion.
- `services/user-service` (MS-02): gestion de usuarios.
- `services/category-service` (MS-03): gestion de categorias.
- `services/product-service` (MS-04): gestion de productos.
- `services/inventory-service` (MS-05/MS-06): movimientos y alertas de inventario.
- `services/audit-service` (MS-09): auditoria y trazabilidad.
- `services/supplier-service` (MS-10): gestion de proveedores.
- `services/export-service` (MS-12): exportacion de datos (Excel/PDF).
- `shared`: utilidades y constantes compartidas.
- `docker/postgres/init`: scripts SQL de inicializacion.

## Stack Tecnologico

- Node.js + Express (backend y gateway)
- React 19 + React Router + Vite (frontend)
- PostgreSQL 16
- Docker Compose
- Node test runner + Supertest (backend)
- Vitest + Testing Library (frontend)

## Puertos

- Frontend (Vite): `5173`
- API Gateway: `3000`
- Product Service: `3001`
- Auth Service: `3002`
- Category Service: `3003`
- User Service: `3004`
- Inventory Service: `3005`
- Audit Service: `3006`
- Export Service: `3007`
- Supplier Service: `3008`
- PostgreSQL host: `5433` (contenedor interno `5432`)

## Ejecucion Rapida (Docker)

Desde la raiz:

```bash
docker compose up --build
```

En otra terminal, levantar frontend:

```bash
cd frontend
npm install
npm run dev
```

URLs:

- Frontend: `http://localhost:5173`
- Gateway: `http://localhost:3000`
- Health gateway: `http://localhost:3000/`

Para apagar:

```bash
docker compose down
```

Para reinicializar base de datos desde cero:

```bash
docker compose down -v
docker compose up --build
```

## Ejecucion Local (sin Docker)

1. Instalar dependencias del monorepo:

```bash
npm install
npm run setup:deps
```

2. Configurar `.env` a partir de:

- `api-gateway/.env.example`
- `services/auth-service/.env.example`
- `services/user-service/.env.example`
- `services/category-service/.env.example`
- `services/inventory-service/.env.example`
- `services/export-service/.env.example`

3. Asegurar PostgreSQL local y BD `invory`.
4. Iniciar servicios (una terminal por servicio):

```bash
cd services/auth-service && npm start
cd services/user-service && npm start
cd services/category-service && npm start
cd services/product-service && npm start
cd services/inventory-service && npm start
cd services/audit-service && npm start
cd services/supplier-service && npm start
cd services/export-service && npm start
cd api-gateway && npm start
cd frontend && npm run dev
```

## Variables de Entorno Clave

- Gateway:
  - `PORT`
  - `AUTH_SERVICE_URL`, `PRODUCT_SERVICE_URL`, `CATEGORY_SERVICE_URL`, `USER_SERVICE_URL`
  - `INVENTORY_SERVICE_URL`, `AUDIT_SERVICE_URL`, `EXPORT_SERVICE_URL`, `PROVIDER_SERVICE_URL`
- Auth:
  - `JWT_SECRET`, `JWT_EXPIRES_IN`
  - `MAX_LOGIN_ATTEMPTS`, `LOCK_TIME_MINUTES`
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Inventory:
  - `AUTH_SERVICE_URL`
  - `MS06_MOVEMENT_WEBHOOK_URL`
  - `MS09_MOVEMENT_WEBHOOK_URL`
- Frontend:
  - `VITE_API_URL` (opcional; por defecto usa `/api` con proxy Vite al gateway `http://localhost:3000`)

## Funcionalidades Principales

- Login/logout y verificacion de sesion con JWT.
- Control de acceso por rol (`Administrador`, `Empleado`).
- CRUD de usuarios, categorias, productos y proveedores.
- Registro y consulta de movimientos de inventario.
- Alertas de inventario (`/api/inventory/alerts`).
- Consulta de bitacora de auditoria.
- Exportacion de datos en Excel/PDF.
- Dashboard, reportes e historial en frontend.

## Rutas Frontend

- Publica: `/login`
- Privadas: `/dashboard`, `/categorias`, `/productos`, `/inventario`, `/historial`, `/reportes`, `/alertas`, `/perfil`
- Solo administrador: `/usuarios`, `/auditoria`, `/proveedores`

## Endpoints Gateway (prefijo `/api`)

- Auth: `/auth/*`
- Users: `/users/*`
- Categories: `/categories/*`
- Products: `/products/*`
- Providers: `/providers/*`
- Inventory: `/inventory/*`
- Audit: `/audit/*`
- Export: `/export`

## Pruebas

Desde la raiz:

```bash
npm run verify:all
```

Comandos utiles:

```bash
npm run verify:gateway
npm run verify:ms02
npm run verify:ms04
npm run verify:ms05
npm run verify:ms06
npm run verify:ms09
```

Frontend:

```bash
cd frontend
npm test
```

## Estructura del Repositorio

```text
Invory/
  api-gateway/
  frontend/
  services/
    auth-service/
    user-service/
    category-service/
    product-service/
    inventory-service/
    audit-service/
    supplier-service/
    export-service/
  shared/
  docker/
  scripts/
  docker-compose.yml
```

## Credenciales Demo (entorno Docker)

Definidas en `docker-compose.yml` para `auth-service`:

- Email: `admin@invory.com`
- Password: `Admin1234`
- Rol: `Administrador`

## Notas

- Los scripts de `docker/postgres/init` se ejecutan solo cuando el volumen de PostgreSQL esta vacio.
- `inventory-service` expone alertas en contrato read-only derivado de inventario actual.
