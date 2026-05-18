# Informe Detallado de la Arquitectura de Backend - Invory

Este documento proporciona una visión profunda y técnica de la arquitectura de backend de **Invory**, incluyendo topología de red, enrutamiento, estrategias de seguridad, comunicación inter-servicios y estructura de contenedores.

---

## 1. Topología de Red y Despliegue

La infraestructura de Invory está contenida en un entorno Docker orquestado mediante `docker-compose`. Se establece una red interna cerrada donde los servicios no exponen sus puertos directamente al host, salvo excepciones puntuales para la comunicación con el cliente o administración.

- **Frontend (Nginx - Puerto 80):** Actúa como el servidor de archivos estáticos y Proxy Inverso primario. Intercepta cualquier petición bajo el prefijo `/api/` y la redirige hacia el API Gateway.
- **API Gateway (Node.js - Puerto 3000):** Único punto de entrada a los microservicios backend. Expuesto internamente a Nginx.
- **Microservicios (Puertos 3001 a 3009):** Completamente aislados de la red externa. Solo son accesibles por el API Gateway u otros microservicios a través del DNS interno de Docker (ej. `http://product-service:3001`).
- **PostgreSQL (Puerto 5432):** El servidor central de base de datos. Se expone al puerto del host 5433 únicamente para labores administrativas (backups y conexiones por clientes SQL).

---

## 2. El API Gateway: Patrones y Rutas

El API Gateway es el núcleo de enrutamiento y seguridad. Implementa un modelo en el que delega la lógica de negocio, pero controla rígidamente quién puede acceder a ella.

### Middleware Globales y Manejo de Errores
- Utiliza `cors` y el parseo de `express.json()`.
- Implementa un **Manejador de Errores Global** (Error Handler) que captura cualquier excepción no controlada y normaliza la salida HTTP a un formato uniforme: `{ success: false, error: { code: '...', message: '...' } }`. Esto asegura consistencia en todas las respuestas del API.

### Enrutamiento y Control de Acceso (RBAC)
Cada petición que entra al Gateway es evaluada. Si la ruta requiere protección, el Gateway utiliza un `authMiddleware` que consulta directamente al **Auth Service** para verificar el token JWT y el rol del usuario.

| Dominio | Prefijo de Ruta | Microservicio Destino | Nivel de Acceso Requerido |
| :--- | :--- | :--- | :--- |
| **Autenticación** | `/api/auth` | `auth-service` (3002) | Público (Login) / Protegido (Logout, Refresh) |
| **Usuarios** | `/api/users` | `user-service` (3004) | Solo Administrador |
| **Categorías** | `/api/categories` | `category-service` (3003) | Administrador (CRUD) y Empleado (Solo Lectura) |
| **Productos** | `/api/products` | `product-service` (3001) | Administrador y Empleado |
| **Proveedores** | `/api/providers` | `supplier-service` (3008) | Solo Administrador |
| **Clientes** | `/api/clients` | `client-service` (3009) | Administrador y Empleado |
| **Fiados (Cuentas)** | `/api/fiados` | `client-service` (3009) | Administrador y Empleado |
| **Inventario** | `/api/inventory` | `inventory-service` (3005) | Administrador y Empleado |
| **Auditoría** | `/api/audit` | `audit-service` (3006) | Solo Administrador |
| **Exportación** | `/api/export` | `export-service` (3007) | Solo Administrador |

*(Nota: Rutas de mutación crítica dentro de ciertos servicios también validan si la operación es de eliminación, limitando algunas al rol Administrador).*

---

## 3. Catálogo de Microservicios Detallado

Cada microservicio está construido con **Node.js** y **Express.js**, utilizando el paquete `pg` (Postgres) puro, sin un ORM (como Prisma o TypeORM), lo que permite mayor rendimiento y control sobre sentencias complejas de SQL.

*Nota: La numeración lógica de los microservicios (`MS-XX`) corresponde al orden de diseño arquitectónico y no a la asignación de puertos, la cual fue asignada dinámicamente según la disponibilidad de la red interna.*

1. **Auth Service (`MS-01` / Puerto 3002):** 
   - **Misión:** Creador y verificador de JWT y gestor de sesiones de la aplicación.
   - **Mecanismos y Controladores:** Expone rutas vitales como `/login`, `/logout`, `/refresh` y `/verify`.
   - **Seguridad Interna:** Encripta contraseñas usando `bcryptjs`. Implementa un sistema de protección contra ataques de fuerza bruta, limitando fallos consecutivos (`MAX_LOGIN_ATTEMPTS=3`) y congelando la cuenta del usuario (`LOCK_TIME_MINUTES=15`). Envía eventos de auditoría (webhook) para registrar cada intento de login (exitoso o fallido).

2. **User Service (`MS-02` / Puerto 3004):**
   - **Misión:** Administración del ciclo de vida de los usuarios y RBAC (Role-Based Access Control).
   - **Funcionamiento:** Separado de Auth Service para mantener la regla de responsabilidad única (lectura/sesión vs gestión/escritura). Expone el CRUD completo de usuarios, solo accesible por el Administrador.

3. **Product & Category Services (`MS-03` / Puerto 3001, `MS-04` / Puerto 3003):**
   - **Misión:** Gestión del catálogo de artículos.
   - **Funcionamiento:** Product Service expone el CRUD de productos y administra los metadatos (precios, códigos de barras, unidades de medida y márgenes de stock). Category Service actúa como soporte jerárquico. Ambos envían webhooks a auditoría ante cualquier cambio crítico en catálogos y precios.

4. **Inventory Service (`MS-05` / Puerto 3005):**
   - **Misión:** El motor transaccional del sistema. Controla la lógica de negocios sobre movimientos, reportes financieros y alertas de inventario.
   - **Endpoints Internos:**
     - **Movimientos:** `registerMovement`, `listMovements` (Control de Entradas, Salidas y Ajustes forzados).
     - **Reportes Dinámicos:** Genera reportes en formato JSON de *Movimientos, Ventas, Stock, Ganancias, Comparativas de periodos, Artículos sin movimiento y Métricas por categoría*.
     - **Facturación:** Emite y cancela facturas comerciales vinculadas a movimientos.
     - **Alertas de Stock:** Expone alertas de bajo stock (`getAlerts`) basándose en los límites configurados en MS-03.
   - **Lógica Fuerte:** Valida que las salidas no dejen el stock en negativo a menos que el rol sea "Administrador" (override). 

5. **Audit Service (`MS-06` / Puerto 3006):**
   - **Misión:** Registro forense inmutable de todas las operaciones trazables.
   - **Funcionamiento:** Trabaja 100% bajo un modelo de eventos *Webhook* asincrónico. Cuando `inventory-service` o `client-service` mutan un registro, disparan una petición HTTP (fire-and-forget) hacia el Audit Service enviando `entidad`, `accion` y los `campos_modificados`. El usuario Administrador puede consultar este log vía `/api/audit/logs`.

6. **Export Service (`MS-07` / Puerto 3007):**
   - **Misión:** Generación síncrona de archivos binarios (Data export).
   - **Funcionamiento:** Recibe solicitudes HTTP para construir un documento. Actúa como un *Aggregator*, solicitando de forma interna a `inventory-service` y `audit-service` la información para luego empaquetarla en archivos de reporte (PDF/Excel) de forma centralizada sin sobrecargar la memoria de los otros servicios lógicos. *(Nota: La vista en pantalla de los "Reportes" del frontend la procesa el Inventory Service y es accesible a Empleados, pero la exportación final de estos en archivos pasa estrictamente por este servicio, el cual está restringido solo a Administradores).*

7. **Supplier Service (`MS-08` / Puerto 3008):**
   - **Misión:** Directorio de proveedores para relacionarlos con las "Entradas" en `Inventory Service` y la conciliación de inventario con compras a terceros.
   - **Funcionamiento:** Administra el CRUD completo de proveedores. Expone endpoints para el registro y la vinculación de estos con la adquisición de mercancía, facilitando la trazabilidad de orígenes de productos en el inventario.

8. **Client Service (`MS-09` / Puerto 3009 - *Módulo de Cartera y Clientes*):**
   - **Misión:** Controlar el directorio de clientes y el crédito interno.
   - **Endpoints Internos:**
     - **CRUD Clientes:** `listClients`, `createClient`, `updateClient`, `patchClientStatus`. Valida normalización de estados (activos/inactivos).
     - **Fiados (Cuentas por cobrar):** Expone `createClientFiado` (Genera una nueva deuda vinculada a una factura), `listFiadosByClient`, `registerFiadoPayment` (Registra abonos a la deuda) y `getFiadosAlerts` (Alerta sobre cuentas por cobrar vencidas).

---

## 4. Estrategia de Base de Datos y Mantenibilidad

El backend emplea un patrón de **Base de Datos Compartida**. Se utiliza un solo contenedor de PostgreSQL 16.
- **Inicialización (Migraciones):** Al levantar el contenedor por primera vez (Volumen vacío), la base de datos se inicializa leyendo los scripts del directorio interno de Docker (`/docker-entrypoint-initdb.d/`). 
- **Archivos Claves de Migración:** 
  - `01_backup_invorybd.sql`: Esquema base (tablas core, triggers de inventario).
  - `02_parametros_sistema.sql`: Crea la tabla `parametros_sistema` y sus seeds.
  - `03_mejoras_invory.sql`: Agrega la columna `monto_pagado` e índices a los movimientos de inventario.
  - `04_rename_invory.sql`: Script de corrección de datos (actualmente deprecado/no-op).
  - `05_mejoras_invory.sql`: Nuevos módulos (Unidades de medida, Facturación, Fiados y Clientes).
- **Inmutabilidad Controlada:** Existen **Triggers** y funciones en base de datos (`evitar_delete_movimientos`) que rechazan forzosamente sentencias `DELETE` desde los servicios, garantizando que el historial contable nunca sea alterado.

---

## 5. Arquitectura de Propagación de Seguridad (Zero-Trust)

Aunque el API Gateway hace un filtrado fuerte, el sistema emplea una ideología *Zero-Trust* interna:
1. El cliente envía su JWT en las cabeceras (`Authorization: Bearer <token>`).
2. El API Gateway intercepta la solicitud, pide al `Auth Service` que la verifique, y si es válida, permite su paso.
3. El Gateway **reenvía** el token intacto al microservicio de destino.
4. El microservicio de destino no asume que el request es seguro solo porque vino del Gateway; parsea y decodifica el token localmente para obtener el contexto de sesión (como el ID del usuario) necesario para las operaciones.

---

## 6. Integración y Despliegue (Docker)

El empaquetado del software está altamente optimizado:
1. **Frontend (Multi-stage build):** Usa una imagen Node.js (Debian Bookworm) en la etapa de construcción para compilar los assets nativos sin errores, y luego copia la salida a un contenedor liviano Nginx-Alpine para servir.
2. **Backend Services:** Tienen Dockerfiles dedicados ubicados en cada subdirectorio (`/services/*`) y construyen el código montando solo lo estrictamente necesario. Esto mantiene el tamaño de imagen mínimo y agiliza el despliegue del ecosistema completo.
