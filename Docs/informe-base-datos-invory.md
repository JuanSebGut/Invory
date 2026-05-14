# Informe Maestro de Base de Datos - INVORY

## 1) Resumen ejecutivo

La base de datos de INVORY esta modelada en PostgreSQL y combina:

- Un nucleo transaccional para inventario (`productos`, `movimientos_inventario`, `motivos_movimiento`, `proveedores`, `categorias`).
- Un nucleo de seguridad y acceso (`usuarios`, `roles`, `permisos`, `roles_permisos`).
- Un nucleo de trazabilidad y gobierno (`auditoria_operaciones`, `auditoria_detalles`, `acciones_auditoria`, `exportaciones_reportes`).
- Configuracion operativa (`configuracion_sistema`, `parametros_sistema`).

El esquema se construye principalmente desde `docker/postgres/init/01_backup_invorybd.sql`, con extensiones en:

- `02_parametros_sistema.sql`
- `03_mejoras_invory.sql`
- `04_rename_invory.sql`

## 2) Alcance del esquema fisico

## 2.1 Tipo enumerado

### `public.tipo_operacion_enum`

Valores:

- `ENTRADA`
- `SALIDA`
- `AJUSTE`

Se utiliza en `motivos_movimiento.tipo_operacion` para tipificar semanticamente la naturaleza de cada movimiento.

## 2.2 Funciones y triggers de integridad

### Funcion `actualizar_stock()`

Regla de negocio embebida en BD:

- Si el movimiento es `ENTRADA` o ajuste tipo sobrante, suma al stock.
- Si es salida o ajuste tipo faltante, resta al stock.
- Bloquea stock negativo con excepcion `Stock insuficiente`.
- Actualiza `productos.stock_actual` automaticamente.

### Funcion `evitar_delete_movimientos()`

- Impide la eliminacion fisica de movimientos (`RAISE EXCEPTION 'No se permite eliminar registros'`).
- Refuerza trazabilidad e inmutabilidad historica.

### Triggers

- `trigger_actualizar_stock`: `BEFORE INSERT` sobre `movimientos_inventario`.
- `trigger_evitar_delete_movimientos`: `BEFORE DELETE` sobre `movimientos_inventario`.

## 3) Diccionario de datos por tabla

## 3.1 Seguridad y acceso

### Tabla `roles`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_rol | integer | No | Identity | PK |
| nombre_rol | varchar(50) | No | - | Unico |
| descripcion | text | Si | - | Descripcion funcional del rol |

Claves:

- PK: `roles_pkey (id_rol)`
- UK: `roles_nombre_rol_key (nombre_rol)`

Datos semilla relevantes:

- `1 = Administrador`
- `2 = Empleado`

### Tabla `usuarios`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_usuario | integer | No | Identity | PK |
| id_rol | integer | No | - | FK a `roles.id_rol` |
| nombre | varchar(100) | No | - | Nombre visible |
| correo | varchar(100) | No | - | Unico |
| contrasena | varchar(255) | No | - | Hash de password |
| estado | boolean | Si | true | Activo/inactivo |
| fecha_creacion | timestamp | Si | CURRENT_TIMESTAMP | Alta |
| ultimo_acceso | timestamp | Si | - | Ultima sesion |
| intentos_fallidos | integer | Si | 0 | Control de bloqueo |
| bloqueado | boolean | Si | false | Estado de seguridad |

Claves:

- PK: `usuarios_pkey (id_usuario)`
- UK: `usuarios_correo_key (correo)`
- FK: `usuarios_id_rol_fkey (id_rol -> roles.id_rol)`

### Tabla `permisos`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_permiso | integer | No | Identity | PK |
| nombre_permiso | varchar(100) | No | - | Unico |

Claves:

- PK: `permisos_pkey (id_permiso)`
- UK: `permisos_nombre_permiso_key (nombre_permiso)`

Nota tecnica:

- En el dump actual, `permisos` aparece sin filas semilla.
- La autorizacion efectiva en runtime se implementa en codigo (`shared/constants/roles.js` y guards de gateway), no desde esta tabla.

### Tabla `roles_permisos`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_rol | integer | No | - | FK a `roles.id_rol` |
| id_permiso | integer | No | - | FK a `permisos.id_permiso` |

Claves:

- PK compuesta: `roles_permisos_pkey (id_rol, id_permiso)`
- FK: `roles_permisos_id_rol_fkey` (`ON DELETE CASCADE`)
- FK: `roles_permisos_id_permiso_fkey` (`ON DELETE CASCADE`)

Nota tecnica:

- En el dump actual, `roles_permisos` tambien aparece sin datos semilla.

## 3.2 Catalogos operativos

### Tabla `categorias`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_categoria | integer | No | Identity | PK |
| nombre_categoria | varchar(100) | No | - | Unico (case-insensitive via indice) |
| descripcion | text | Si | - | - |
| estado | boolean | Si | true | Activo/inactivo |

Claves e indices:

- PK: `categorias_pkey (id_categoria)`
- UK: `unique_nombre_categoria (nombre_categoria)`
- Indice unico funcional: `idx_categorias_nombre_categoria_lower` en `lower(nombre_categoria)`

### Tabla `proveedores`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_proveedor | integer | No | Identity | PK |
| razon_social | varchar(150) | No | - | Unico |
| nit_identificacion | varchar(50) | No | - | Unico |
| telefono | varchar(20) | Si | - | - |
| direccion | text | Si | - | - |
| correo | varchar(100) | Si | - | - |
| estado | boolean | Si | true | Activo/inactivo |

Claves:

- PK: `proveedores_pkey (id_proveedor)`
- UK: `unique_razon_social (razon_social)`
- UK: `proveedores_nit_identificacion_key (nit_identificacion)`

### Tabla `productos`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_producto | integer | No | Identity | PK |
| id_categoria | integer | No | - | FK a `categorias` |
| codigo_barras_unico | varchar(50) | No | - | Unico |
| nombre | varchar(150) | No | - | - |
| precio_compra | numeric(12,2) | No | - | `>= 0` |
| precio_venta | numeric(12,2) | No | - | Sin check explicito en dump |
| stock_actual | integer | No | 0 | `>= 0` |
| stock_minimo | integer | Si | 0 | `>= 0` |
| stock_maximo | integer | Si | - | `>= stock_minimo` |
| fecha_vencimiento | date | Si | - | - |
| estado | boolean | Si | true | Activo/inactivo |
| fecha_creacion | timestamp | Si | CURRENT_TIMESTAMP | Alta |
| ubicacion | varchar(100) | Si | - | Ubicacion fisica |
| descripcion | text | Si | - | - |

Claves y checks:

- PK: `productos_pkey (id_producto)`
- UK: `productos_codigo_barras_unico_key (codigo_barras_unico)`
- FK: `productos_id_categoria_fkey (id_categoria -> categorias.id_categoria)`
- Check: `productos_check1` (`stock_maximo >= stock_minimo`)
- Check: `productos_precio_compra_check` (`precio_compra >= 0`)
- Check: `productos_stock_actual_check` (`stock_actual >= 0`)
- Check: `productos_stock_minimo_check` (`stock_minimo >= 0`)
- Indice: `idx_productos_codigo_barras (codigo_barras_unico)`

### Tabla `codigos_barras`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_codigo | integer | No | secuencia (legacy) | PK |
| id_producto | integer | Si | - | FK a `productos` |
| codigo | varchar(100) | Si | - | Unico |

Claves:

- PK: `codigos_barras_pkey (id_codigo)`
- UK: `codigos_barras_codigo_key (codigo)`
- FK: `codigos_barras_id_producto_fkey (id_producto -> productos.id_producto)`

## 3.3 Inventario y movimientos

### Tabla `motivos_movimiento`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_motivo | integer | No | Identity | PK |
| nombre_motivo | varchar(50) | No | - | Etiqueta de negocio |
| tipo_operacion | tipo_operacion_enum | No | - | ENTRADA/SALIDA/AJUSTE |

Claves:

- PK: `motivos_movimiento_pkey (id_motivo)`

### Tabla `movimientos_inventario`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_movimiento | integer | No | Identity | PK |
| id_producto | integer | No | - | FK a `productos` |
| id_usuario | integer | No | - | FK a `usuarios` |
| id_proveedor | integer | Si | - | FK a `proveedores` |
| id_motivo | integer | No | - | FK a `motivos_movimiento` |
| cantidad | integer | No | - | `> 0` |
| stock_anterior | integer | No | - | Snapshot |
| stock_posterior | integer | No | - | Calculado por trigger |
| numero_factura | varchar(50) | Si | - | Evidencia externa |
| comentarios | text | Si | - | Trazabilidad |
| fecha_hora_exacta | timestamp | Si | CURRENT_TIMESTAMP | Fecha operativa |
| monto_pagado | numeric(12,2) | Si | - | Agregado en `03_mejoras_invory.sql` |

Claves e indices:

- PK: `movimientos_inventario_pkey (id_movimiento)`
- FK: `movimientos_inventario_id_producto_fkey`
- FK: `movimientos_inventario_id_usuario_fkey`
- FK: `movimientos_inventario_id_proveedor_fkey`
- FK: `movimientos_inventario_id_motivo_fkey`
- Check: `movimientos_inventario_cantidad_check (cantidad > 0)`
- Indice: `idx_movimientos_fecha (fecha_hora_exacta)`
- Indice: `idx_movimientos_motivo (id_motivo)`
- Indice: `idx_movimientos_producto (id_producto)`
- Indice compuesto: `idx_movimientos_producto_fecha (id_producto, fecha_hora_exacta)`
- Indice parcial: `idx_movimientos_monto (monto_pagado) WHERE monto_pagado IS NOT NULL`

### Tabla `ajustes_inventario`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_ajuste | integer | No | secuencia (legacy) | PK |
| id_usuario | integer | Si | - | FK a `usuarios` |
| fecha | timestamp | Si | CURRENT_TIMESTAMP | Fecha ajuste |
| id_producto | integer | Si | - | FK a `productos` |
| cantidad | integer | No | 0 | Magnitud |
| motivo | text | Si | - | Justificacion |
| tipo_ajuste | varchar(20) | Si | - | `SOBRANTE`/`FALTANTE` |

Claves, checks e indices:

- PK: `ajustes_inventario_pkey (id_ajuste)`
- FK: `ajustes_inventario_id_producto_fkey`
- FK: `ajustes_inventario_id_usuario_fkey`
- Check: `ajustes_inventario_tipo_ajuste_check`
- Indice: `idx_ajustes_fecha`
- Indice: `idx_ajustes_producto`
- Indice: `idx_ajustes_usuario`

## 3.4 Auditoria y exportaciones

### Tabla `acciones_auditoria`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_accion | integer | No | Identity | PK |
| nombre_accion | varchar(50) | No | - | Unico |

Claves:

- PK: `acciones_auditoria_pkey (id_accion)`
- UK: `acciones_auditoria_nombre_accion_key (nombre_accion)`

### Tabla `auditoria_operaciones`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_auditoria | integer | No | Identity | PK |
| id_usuario | integer | No | - | FK a `usuarios` |
| id_accion | integer | No | - | FK a `acciones_auditoria` |
| entidad_afectada | varchar(50) | No | - | Ej: productos, usuarios |
| id_entidad_afectada | integer | No | - | ID del registro de negocio |
| fecha_hora | timestamp | Si | CURRENT_TIMESTAMP | Marca temporal |

Claves:

- PK: `auditoria_operaciones_pkey (id_auditoria)`
- FK: `auditoria_operaciones_id_usuario_fkey`
- FK: `auditoria_operaciones_id_accion_fkey`

### Tabla `auditoria_detalles`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_detalle | integer | No | Identity | PK |
| id_auditoria | integer | No | - | FK a `auditoria_operaciones` |
| campo_modificado | varchar(50) | No | - | Campo impactado |
| valor_anterior | text | Si | - | - |
| valor_nuevo | text | Si | - | - |

Claves:

- PK: `auditoria_detalles_pkey (id_detalle)`
- FK: `auditoria_detalles_id_auditoria_fkey` con `ON DELETE CASCADE`

### Tabla `exportaciones_reportes`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_exportacion | integer | No | secuencia (legacy) | PK |
| tipo_reporte | varchar(100) | No | - | Tipo exportado |
| formato | varchar(10) | Si | - | `PDF` o `EXCEL` |
| fecha_generacion | timestamp | Si | CURRENT_TIMESTAMP | Fecha de emision |
| usuario_generador | integer | Si | - | FK a `usuarios` |
| ruta_archivo | text | Si | - | Ruta del artefacto |

Claves:

- PK: `exportaciones_reportes_pkey (id_exportacion)`
- FK: `exportaciones_reportes_usuario_fkey (usuario_generador -> usuarios.id_usuario)`
- Check: `exportaciones_reportes_formato_check`

## 3.5 Configuracion

### Tabla `configuracion_sistema`

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| id_parametro | integer | No | secuencia (legacy) | PK |
| nombre_tienda | varchar(100) | No | - | Unico |
| moneda | varchar(10) | No | - | ISO o abreviatura |
| stock_minimo_default | integer | No | - | `>= 0` |
| stock_maximo_default | integer | No | - | `>= stock_minimo_default` |
| prefijo_codigo_barras | varchar(10) | Si | - | Prefijo operativo |

Claves y checks:

- PK: `configuracion_sistema_pkey (id_parametro)`
- UK: `configuracion_sistema_nombre_tienda_key (nombre_tienda)`
- Check: `cfg_stock_minimo_positivo`
- Check: `cfg_stock_maximo_positivo`
- Check: `cfg_stock_max_mayor_min`

### Tabla `parametros_sistema` (MS-11)

Creada en `02_parametros_sistema.sql`.

| Columna | Tipo | Nulo | Default | Observaciones |
|---|---|---|---|---|
| clave | text | No | - | PK natural |
| valor | text | No | - | Valor configurable |
| updated_at | timestamptz | Si | now() | Trazabilidad de actualizacion |

Claves:

- PK: `parametros_sistema_pkey (clave)`

Semillas iniciales:

- `dias_expiracion_alertas = 30`
- `max_intentos_login = 3`
- `tiempo_bloqueo_minutos = 15`

## 4) Mapa de relaciones (modelo relacional)

Relaciones principales:

- `usuarios.id_rol -> roles.id_rol`
- `roles_permisos.id_rol -> roles.id_rol`
- `roles_permisos.id_permiso -> permisos.id_permiso`
- `productos.id_categoria -> categorias.id_categoria`
- `codigos_barras.id_producto -> productos.id_producto`
- `movimientos_inventario.id_producto -> productos.id_producto`
- `movimientos_inventario.id_usuario -> usuarios.id_usuario`
- `movimientos_inventario.id_proveedor -> proveedores.id_proveedor`
- `movimientos_inventario.id_motivo -> motivos_movimiento.id_motivo`
- `ajustes_inventario.id_producto -> productos.id_producto`
- `ajustes_inventario.id_usuario -> usuarios.id_usuario`
- `auditoria_operaciones.id_usuario -> usuarios.id_usuario`
- `auditoria_operaciones.id_accion -> acciones_auditoria.id_accion`
- `auditoria_detalles.id_auditoria -> auditoria_operaciones.id_auditoria (ON DELETE CASCADE)`
- `exportaciones_reportes.usuario_generador -> usuarios.id_usuario`

## 5) Permisos por rol (explicacion funcional magistral)

## 5.1 Fuente de verdad de autorizacion

En el estado actual del proyecto, la autorizacion efectiva se aplica por capa de aplicacion (API Gateway + microservicios) usando:

- `shared/constants/roles.js`
- Middlewares `requireRoles` y guards por ruta

Aunque existen tablas `permisos` y `roles_permisos`, el dump actual no trae carga de permisos; por tanto, **la matriz operativa real vive en codigo**.

## 5.2 Roles oficiales

### Administrador

Capacidad estrategica y operativa total:

- Gestiona usuarios (alta, edicion, baja logica, desbloqueo).
- Gestiona catalogos maestros (categorias, productos, proveedores).
- Registra entradas, salidas y ajustes de inventario.
- Puede forzar ciertas salidas criticas (`force=true`) segun reglas de inventario.
- Consulta auditoria completa.
- Exporta datos (PDF/Excel).
- Administra configuraciones del sistema.

### Empleado

Capacidad operativa controlada:

- Consulta inventario y catalogos.
- Registra entradas y salidas de inventario.
- Consulta alertas y reportes predefinidos.

Restricciones clave:

- No puede gestionar usuarios.
- No puede registrar ajustes de inventario.
- No puede consultar modulo de auditoria.
- No puede exportar datos.
- No puede ejecutar acciones de configuracion avanzada.

## 5.3 Matriz de permisos (estado de implementacion)

| Permiso logico | Administrador | Empleado |
|---|---|---|
| `REGISTRAR_AJUSTE` | Si | No |
| `REGISTRAR_MOVIMIENTO` | Si | Si |
| `GESTIONAR_USUARIOS` | Si | No |
| `VER_AUDITORIA` | Si | No |
| `CONFIGURAR_SISTEMA` | Si | No |
| `CONSULTAR_INVENTARIO` | Si | Si |
| `VER_REPORTES` | Si | Si |
| `EXPORTAR_DATOS` | Si | No |
| `DESBLOQUEAR_CUENTA` | Si | No |

## 5.4 Materializacion por rutas (Gateway)

- `/api/users/*`: solo Administrador.
- `/api/categories`:
  - `GET`: Administrador y Empleado.
  - `POST/PUT/DELETE`: Administrador.
- `/api/products`:
  - `GET`: Administrador y Empleado.
  - `POST/PUT/DELETE`: Administrador.
- `/api/providers/*`: solo Administrador.
- `/api/inventory/alerts`: Administrador y Empleado.
- `/api/inventory/movements` (GET/POST): Administrador y Empleado.
- `/api/inventory/reports/:reportType`: Administrador y Empleado.
- `/api/audit/logs`: solo Administrador.
- `/api/export` (POST): solo Administrador.

## 6) Reglas de consistencia e integridad destacadas

- Integridad referencial completa por FK en nucleos transaccional, seguridad y auditoria.
- Proteccion de dominio con checks (`stock`, `cantidad`, `formato`, `tipo_ajuste`).
- Politica de no borrado de movimientos por trigger dedicado.
- Actualizacion automatica del stock de producto al insertar movimientos.
- Indices orientados a consultas por tiempo, producto y auditoria de operaciones.

## 7) Hallazgos tecnicos y recomendaciones

1. `permisos` y `roles_permisos` existen en el modelo pero no se usan como fuente activa en el dump actual.
2. Si se desea RBAC 100% data-driven, conviene sembrar `permisos` y `roles_permisos` y migrar los guards para consultar DB/cache.
3. Coexisten columnas con `IDENTITY` y otras con secuencia legacy en defaults; funcionalmente valido, pero recomendable unificar estrategia para mantenimiento.
4. El archivo `04_rename_invory.sql` actualmente ejecuta un `UPDATE` que no cambia valor real; parece un placeholder y podria limpiarse o documentarse.

## 8) Conclusiones

La base de datos de INVORY presenta una arquitectura madura para operar inventarios con trazabilidad: modela bien catalogos, movimientos, actores, auditoria y exportaciones. Sus controles de integridad y sus triggers criticos reducen riesgo operacional. El principal siguiente salto de madurez seria consolidar la capa de permisos en datos (`permisos`/`roles_permisos`) para alinear completamente modelo fisico y enforcement en tiempo de ejecucion.
