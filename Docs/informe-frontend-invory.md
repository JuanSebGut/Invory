# Informe Integral del Frontend - INVORY

## 1) Resumen general

El frontend de INVORY es una SPA construida con **React + Vite + React Router**. Su objetivo es centralizar la operacion funcional del inventario mediante vistas por dominio (usuarios, categorias, productos, inventario, alertas, auditoria, reportes, proveedores, perfil), con control de acceso por autenticacion y rol.

Stack principal:

- React 19
- React Router DOM 7
- Vite
- Fetch API nativa
- CSS modular por pagina

## 2) Estructura del frontend

Ubicacion base: `frontend/src`

Capas principales:

- `App.jsx`: define rutas y guards de acceso.
- `components/Layout.jsx`: layout global con navegacion, avatar, campana de alertas y logout.
- `context/AuthContext.jsx` + `hooks/useAuth.js`: estado de sesion y usuario.
- `pages/*`: vistas funcionales.
- `api/*`: capa de consumo HTTP hacia API Gateway.
- `utils/*`: utilidades de apoyo (ej. numeracion factura).

## 3) Enrutamiento y control de acceso

Rutas definidas en `frontend/src/App.jsx`:

- `/` -> redireccion inteligente (login o dashboard)
- `/login` -> publica
- `/dashboard` -> privada
- `/categorias` -> privada
- `/usuarios` -> solo Admin
- `/productos` -> privada
- `/inventario` -> privada
- `/historial` -> privada
- `/alertas` -> privada
- `/reportes` -> privada
- `/auditoria` -> solo Admin
- `/proveedores` -> solo Admin
- `/perfil` -> privada

Guards implementados:

- `PublicRoute`: evita entrar a login si ya hay sesion.
- `PrivateRoute`: exige sesion valida.
- `AdminRoute`: exige sesion + rol `Administrador`.

## 4) Navegacion y experiencia por rol

En `Layout.jsx`, el menu superior cambia por rol:

- **Administrador**: usuarios, categorias, proveedores, productos, inventario, historial, auditoria, reportes.
- **Empleado**: productos, inventario, historial, reportes.

Componentes persistentes del layout:

- marca y acceso a dashboard
- campana de alertas (`/alertas`) con indicador visual
- avatar con acceso a `/perfil`
- boton de salida de sesion

## 5) Vistas funcionales (que tiene y como funcionan)

## 5.1 Login (`/login`)

Archivo: `pages/Login/login.jsx`

Funciones:

- formulario de correo y contrasena
- validacion basica cliente
- consumo `POST /api/auth/login`
- guarda sesion en `AuthContext`
- manejo de errores (credenciales invalidas, cuenta bloqueada, cuenta inactiva)

Observacion tecnica:

- redirecciona a `/dashboard/admin` para admin, pero esa ruta no existe en `App.jsx`; el dashboard valido es `/dashboard`.

## 5.2 Dashboard (`/dashboard`)

Archivo en uso por ruta: `pages/Dashboard/DashboardPage.jsx`

Funciones:

- carga de KPIs (ventas hoy, alertas, movimientos del dia, valor inventario)
- listado de movimientos recientes
- navegacion rapida a alertas y otras vistas
- consumo paralelo de APIs (`reports`, `alerts`, `inventory`)

Nota:

- existe otro dashboard alterno: `pages/Dashboard/Dashboard.jsx` (mas extenso), pero la ruta actual usa `DashboardPage.jsx`.

## 5.3 Categorias (`/categorias`)

Archivo: `pages/Categories/Categories.jsx`

Funciones:

- listar categorias
- crear/editar categoria (modal)
- habilitar/deshabilitar categoria con confirmacion
- toasts de feedback
- empleado en modo lectura, admin con CRUD

## 5.4 Usuarios (`/usuarios`, solo admin)

Archivo: `pages/Users/UsersPage.jsx`

Funciones:

- paginacion y filtro por estado (activo/inactivo/todos)
- busqueda por nombre/correo
- crear/editar usuario
- deshabilitar usuario (borrado logico)
- reglas de seguridad (no auto-deshabilitar, no deshabilitar admin demo)

## 5.5 Productos (`/productos`)

Archivo: `pages/Products/ProductsPage.jsx`

Funciones:

- listado con paginacion
- busqueda por nombre/codigo
- filtro por categoria
- modal de detalle de producto
- admin: crear/editar/deshabilitar
- empleado: orientado a consulta

## 5.6 Inventario (`/inventario`)

Archivo: `pages/Inventory/Inventory.jsx`

Funciones:

- registrar entrada, salida o ajuste
- soporte venta multiproducto
- calculo de total pagado/vuelto para ventas
- integracion con proveedores activos
- validaciones por tipo de movimiento
- opcion `force_minimo` para admin si una salida cruza stock minimo

## 5.7 Historial (`/historial`)

Archivo: `pages/History/HistoryPage.jsx`

Funciones:

- consulta de movimientos historicos
- filtros por fecha, tipo, producto, factura
- formato visual de cantidades (+/-) segun tipo de movimiento

## 5.8 Alertas (`/alertas`)

Archivo: `pages/Alerts/AlertsPage.jsx`

Funciones:

- alertas por tipo: `low-stock`, `high-stock`, `expiring-soon`
- KPIs por tipo
- filtros por tipo y categoria
- visualizacion de barras/estado por producto
- consumo principal de `GET /api/inventory/alerts`

## 5.9 Reportes (`/reportes`)

Archivo: `pages/Reports/ReportsPage.jsx`

Funciones:

- reportes por tipo: `movements`, `sales`, `stock`
- periodos predefinidos + rango personalizado
- tabla dinamica y resumenes (totales, margen, etc.)
- admin: exportacion PDF/Excel via `POST /api/export`
- empleado: lectura sin exportar

## 5.10 Auditoria (`/auditoria`, solo admin)

Archivo: `pages/Audit/Audit.jsx`

Funciones:

- consulta de logs de auditoria
- filtros por usuario, modulo, accion, fecha/rango
- paginacion
- modal de detalle con before/after de cambios

## 5.11 Proveedores (`/proveedores`, solo admin)

Archivo: `pages/Providers/ProvidersPage.jsx`

Funciones:

- CRUD de proveedores
- validaciones de formulario (incluido email)
- busqueda/filtro/paginacion
- deshabilitacion logica con confirmacion

## 5.12 Perfil (`/perfil`)

Archivo: `pages/Profile/ProfilePage.jsx`

Funciones:

- ver/actualizar datos personales basicos
- cambio de contrasena
- lectura de perfil actual via `/api/users/me`

## 6) Capa de comunicacion API (frontend -> backend)

Carpeta: `frontend/src/api`

Patron comun:

- base URL: `VITE_API_URL` o fallback `http://localhost:3000/api` / `/api`
- token JWT leido de `localStorage` (`invory_token`)
- `Authorization: Bearer <token>` en endpoints protegidos
- parseo de error robusto para mostrar mensajes legibles

Modulos API principales:

- `auth.js`
- `users.js`
- `categories.js`
- `products.js`
- `inventory.js`
- `alerts.js`
- `audit.js`
- `providers.js`
- `reports.js`
- `exports.js`

## 7) Estado de sesion y seguridad

`AuthContext` mantiene:

- token
- usuario autenticado (`id_usuario`, `rol`, `nombre`, `correo`)
- estado de carga inicial de sesion

Mecanismo:

- login guarda token y usuario
- guards bloquean rutas segun autenticacion/rol
- logout limpia token local y notifica al backend cuando es posible

## 8) Estilo y UX

- CSS separado por vista (`pages/*/*.css`)
- enfoque fuerte en UI administrativa: tablas, modales, toasts, badges, filtros, paginacion
- feedback visual consistente para estados de carga, vacio y error

## 9) Pruebas frontend

Scripts en `frontend/package.json`:

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm test` (Vitest)

Cobertura visible en repo:

- `src/App.test.jsx`
- `src/pages/Reports/ReportsPage.test.jsx`
- pruebas de helpers API (`reports.test.js`, `exports.test.js`)

## 10) Hallazgos tecnicos relevantes

1. Inconsistencia de ruta post-login para admin (`/dashboard/admin`) vs rutas reales (`/dashboard`).
2. Coexistencia de dos implementaciones de dashboard (`DashboardPage.jsx` y `Dashboard.jsx`), potencial deuda de mantenimiento.
3. Algunos archivos muestran problemas de codificacion de caracteres (acentos con reemplazos), recomendable normalizar UTF-8 en todo el frontend.

## 11) Conclusiones

El frontend de INVORY esta bien estructurado para un sistema de operacion empresarial: separa rutas, vistas, capa API y control de permisos de manera clara. La experiencia cubre todo el ciclo operativo (catalogo, inventario, trazabilidad, auditoria, reportes y exportacion). Los principales ajustes recomendados son de consistencia de rutas y consolidacion de componentes duplicados para reducir deuda tecnica.
