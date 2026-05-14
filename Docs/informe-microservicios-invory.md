# Informe Completo de Microservicios - INVORY

## 1) Vision general del ecosistema

INVORY implementa una arquitectura de microservicios con un **API Gateway** como punto unico de entrada para el frontend. La solucion divide responsabilidades por dominio (autenticacion, usuarios, catalogos, inventario, auditoria, proveedores y exportacion), con integracion por HTTP y algunos flujos asincronos por webhook.

Servicios desplegados:

- `api-gateway` (orquestador de entrada)
- `auth-service` (MS-01)
- `user-service` (MS-02)
- `category-service` (MS-03)
- `product-service` (MS-04)
- `inventory-service` (MS-05/MS-06/MS-07 parcial)
- `audit-service` (MS-09)
- `supplier-service` (MS-10)
- `export-service` (MS-12)
- `postgres` (persistencia central)

## 2) Mapa de dependencias entre microservicios

## 2.1 Dependencias salientes (que consume cada servicio)

- `api-gateway` consume: `auth-service`, `user-service`, `category-service`, `product-service`, `inventory-service`, `audit-service`, `export-service`, `supplier-service`.
- `auth-service` consume: PostgreSQL y webhook a `audit-service` (`MS09_AUDIT_WEBHOOK_URL`).
- `user-service` consume: PostgreSQL y webhook a `audit-service`.
- `category-service` consume: PostgreSQL.
- `product-service` consume: PostgreSQL.
- `inventory-service` consume: PostgreSQL, `auth-service` (validacion token), webhook a `audit-service`.
- `audit-service` consume: PostgreSQL y `auth-service` (verificacion de identidad para consulta protegida).
- `supplier-service` consume: PostgreSQL.
- `export-service` consume: PostgreSQL, `auth-service`, `inventory-service`, `audit-service`.

## 2.2 Dependencias entrantes (quien depende de cada servicio)

- `auth-service` es dependencia critica de: `api-gateway`, `inventory-service`, `audit-service`, `export-service`.
- `user-service`, `category-service`, `product-service`, `supplier-service` son consumidos principalmente por `api-gateway`.
- `inventory-service` es consumido por `api-gateway` y `export-service`.
- `audit-service` recibe eventos de `auth-service`, `user-service`, `inventory-service`; y es consumido por `api-gateway` y `export-service`.
- `export-service` es consumido por `api-gateway`.

## 3) API Gateway (`api-gateway`)

## 3.1 Que es y para que sirve

Es la puerta unica del frontend. Centraliza:

- autenticacion (delegada a `auth-service`)
- autorizacion por rol (Administrador/Empleado)
- proxy y normalizacion de rutas a los demas microservicios
- propagacion de contexto de usuario (`x-user-*`) hacia servicios downstream

## 3.2 Que expone

Prefijo `/api` por dominio:

- `/auth/*`
- `/users/*`
- `/categories/*`
- `/products/*`
- `/providers/*`
- `/inventory/*`
- `/audit/*`
- `/export`

## 3.3 Dependencias

- **Depende de** todos los microservicios de negocio.
- **Dependen de el**: frontend web (cliente principal).

## 3.4 Scripts

En `api-gateway/package.json`:

- `start`: `node server.js`  
  Inicia el gateway en modo runtime.
- `test`: `node --test --experimental-test-isolation=none "tests/**/*.test.js"`  
  Ejecuta pruebas de integracion/contrato del gateway, sin aislamiento estricto entre archivos de test.

## 4) Auth Service (`services/auth-service`, MS-01)

## 4.1 Que es y para que sirve

Microservicio de identidad y sesion. Gestiona login, logout, refresh y verificacion de JWT. Tambien aplica politicas de seguridad como intentos fallidos y bloqueo temporal.

## 4.2 Responsabilidades funcionales

- validar credenciales
- emitir y refrescar token
- verificar token para otros servicios
- registrar eventos de seguridad auditables

## 4.3 Dependencias

- **Depende de**: PostgreSQL y `audit-service` (webhook de auditoria).
- **Dependen de el**: `api-gateway`, `inventory-service`, `audit-service`, `export-service`.

## 4.4 Scripts

En `services/auth-service/package.json`:

- `start`: `node server.js`  
  Levanta MS-01.
- `test`: `node --test --experimental-test-isolation=none --test-force-exit tests/**/*.test.js`  
  Pruebas del servicio; `--test-force-exit` fuerza cierre al finalizar para evitar procesos colgados.

## 5) User Service (`services/user-service`, MS-02)

## 5.1 Que es y para que sirve

Servicio de administracion de usuarios: altas, consulta, actualizacion y baja logica. Maneja atributos de seguridad (estado, bloqueado, intentos fallidos) y perfil de rol.

## 5.2 Responsabilidades funcionales

- CRUD de usuarios
- validacion de reglas de negocio de gestion de usuarios
- disparo de eventos auditables hacia MS-09

## 5.3 Dependencias

- **Depende de**: PostgreSQL y webhook a `audit-service`.
- **Dependen de el**: `api-gateway` (exposicion al frontend y control de acceso).

## 5.4 Scripts

En `services/user-service/package.json`:

- `start`: `node server.js`  
  Levanta MS-02.
- `test`: `node --test --experimental-test-isolation=none tests/**/*.test.js`  
  Ejecuta pruebas de integracion y contratos del servicio.

## 6) Category Service (`services/category-service`, MS-03)

## 6.1 Que es y para que sirve

Servicio de catalogo de categorias. Es la taxonomia del inventario y condiciona la clasificacion de productos.

## 6.2 Responsabilidades funcionales

- crear categorias
- listar categorias
- actualizar categorias
- eliminar categorias (segun reglas del dominio)

## 6.3 Dependencias

- **Depende de**: PostgreSQL.
- **Dependen de el**: `api-gateway` y, de forma conceptual, `product-service` por consistencia del dominio (productos referencian categorias).

## 6.4 Scripts

En `services/category-service/package.json`:

- `start`: `node server.js`  
  Levanta MS-03.
- `test`: `node --test --experimental-test-isolation=none tests/**/*.test.js`  
  Corre pruebas del servicio.

## 7) Product Service (`services/product-service`, MS-04)

## 7.1 Que es y para que sirve

Servicio de catalogo de productos. Centraliza los datos maestros del item inventariable (codigo, precios, stock, categoria, estado, ubicacion).

## 7.2 Responsabilidades funcionales

- CRUD de productos
- validaciones de estructura de producto
- soporte de consultas para vistas operativas

## 7.3 Dependencias

- **Depende de**: PostgreSQL.
- **Dependen de el**: `api-gateway` (operacion diaria), y `export-service` de manera funcional cuando exporta datasets relacionados a productos.

## 7.4 Scripts

En `services/product-service/package.json`:

- `start`: `node server.js`  
  Inicia MS-04.
- `test`: `node --test --experimental-test-isolation=none tests/**/*.test.js`  
  Ejecuta suite de pruebas de producto.

## 8) Inventory Service (`services/inventory-service`, MS-05/MS-06)

## 8.1 Que es y para que sirve

Es el servicio transaccional del inventario. Registra movimientos (entradas/salidas/ajustes), calcula impacto en stock y genera vistas de alertas y reportes operativos.

## 8.2 Responsabilidades funcionales

- registrar movimientos de inventario
- listar historial de movimientos
- exponer reportes por tipo
- exponer alertas de stock
- aplicar reglas de permisos por rol (por ejemplo: ajuste solo Administrador)

## 8.3 Particularidad de rutas

Conviven dos prefijos historicos:

- `/api/inventory/*` para movimientos y reportes
- `/inventory/alerts` para alertas

El gateway unifica para el frontend bajo `/api/inventory/*`.

## 8.4 Dependencias

- **Depende de**: PostgreSQL, `auth-service` (verificacion de JWT), `audit-service` via webhook de movimientos.
- **Dependen de el**: `api-gateway` y `export-service`.

## 8.5 Scripts

En `services/inventory-service/package.json`:

- `start`: `node server.js`  
  Levanta MS-05/MS-06.
- `test`: `node --test --experimental-test-isolation=none tests/**/*.test.js`  
  Ejecuta tests de inventario (integracion y unitarios segun carpeta `tests`).

## 9) Audit Service (`services/audit-service`, MS-09)

## 9.1 Que es y para que sirve

Servicio de trazabilidad. Recibe eventos auditable de otros servicios y ofrece consulta del log con acceso restringido.

## 9.2 Responsabilidades funcionales

- registrar eventos (`POST /api/audit/events`)
- listar logs (`GET /api/audit/logs`) para perfiles autorizados
- almacenar evidencia de actor, accion, entidad, fecha y detalles

## 9.3 Dependencias

- **Depende de**: PostgreSQL y `auth-service` (validacion de acceso en consultas).
- **Dependen de el**: `api-gateway` (consulta), `auth-service`, `user-service`, `inventory-service` (emision de eventos).

## 9.4 Scripts

En `services/audit-service/package.json`:

- `start`: `node server.js`  
  Inicia MS-09.
- `test`: `node --test --experimental-test-isolation=none tests/**/*.test.js`  
  Pruebas del modulo de auditoria.

## 10) Supplier Service (`services/supplier-service`, MS-10)

## 10.1 Que es y para que sirve

Servicio de gestion de proveedores. Administra las entidades de abastecimiento que soportan entradas de inventario y trazabilidad comercial.

## 10.2 Responsabilidades funcionales

- CRUD de proveedores
- mantenimiento de datos de contacto e identificacion fiscal

## 10.3 Dependencias

- **Depende de**: PostgreSQL.
- **Dependen de el**: `api-gateway` y `inventory-service` indirectamente por referencia de proveedor en movimientos.

## 10.4 Scripts

En `services/supplier-service/package.json`:

- `start`: `node server.js`  
  Levanta MS-10.
- `test`: `node --test tests/**/*.test.js`  
  Ejecuta pruebas; este servicio no usa la bandera `--experimental-test-isolation=none` en su script actual.

## 11) Export Service (`services/export-service`, MS-12)

## 11.1 Que es y para que sirve

Servicio especializado de exportacion de datos empresariales en formatos descargables (`EXCEL`/`PDF`).

## 11.2 Responsabilidades funcionales

- recibir solicitud de exportacion
- consultar/armar dataset desde servicios y/o DB
- generar archivo temporal
- transmitir descarga con metadatos (`Content-Disposition`, `X-Export-Records`)
- limpiar artefactos temporales

## 11.3 Dependencias

- **Depende de**: PostgreSQL, `auth-service`, `inventory-service`, `audit-service`.
- **Dependen de el**: `api-gateway` (exposicion al frontend de reportes/exportaciones).

## 11.4 Scripts

En `services/export-service/package.json`:

- `start`: `node server.js`  
  Inicia MS-12.
- `test`: `node --test --experimental-test-isolation=none tests/**/*.test.js`  
  Ejecuta pruebas de exportaciones y contratos.

## 12) Explicacion tecnica de scripts (criterio uniforme)

En casi todos los microservicios hay dos scripts base:

- `start`: arranque del proceso Node productivo/local.
- `test`: ejecucion de pruebas con Node Test Runner.

Diferencias importantes:

- Varios servicios usan `--experimental-test-isolation=none` para evitar aislamiento fuerte por archivo en su suite actual.
- `auth-service` agrega `--test-force-exit` para cerrar ejecucion aunque algun recurso quede abierto.
- `supplier-service` mantiene un `test` mas simple (`node --test ...`) sin flags adicionales.

## 13) Orden de criticidad operativa (si uno cae)

1. `auth-service`: impacto transversal (autenticacion y autorizacion).
2. `api-gateway`: frontend queda sin backend unificado.
3. `inventory-service`: impacto directo en operacion core.
4. `postgres`: caida total de persistencia.
5. `audit-service`: se pierde trazabilidad en tiempo real.
6. `export-service`: se afecta salida documental/reporting descargable.
7. `user-service`, `product-service`, `category-service`, `supplier-service`: impacto por dominio especifico.

## 14) Conclusiones

La malla de microservicios de INVORY esta bien segmentada por capacidades de negocio. El gateway desacopla al frontend de la complejidad interna, mientras que la auditoria y la seguridad de roles agregan control institucional fuerte. La arquitectura esta lista para evolucionar hacia patrones de mayor resiliencia (reintentos, circuit breakers, colas de eventos) sin romper su separacion actual de dominios.
