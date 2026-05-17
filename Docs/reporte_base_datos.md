# Informe de Arquitectura de Base de Datos - Invory

Este documento describe la estructura relacional de la base de datos PostgreSQL de **Invory**, incluyendo sus tablas, atributos principales, relaciones y lógica de negocio implementada a nivel de base de datos.

## 1. Módulo de Seguridad y Configuración

Este módulo gestiona el acceso al sistema, roles y configuraciones generales.

### Tablas:
- **`usuarios`**: Gestiona el acceso al sistema.
  - *Atributos*: `id_usuario` (PK), `id_rol` (FK), `nombre`, `correo`, `contrasena`, `estado`, `fecha_creacion`, `ultimo_acceso`, `intentos_fallidos`, `bloqueado`.
- **`roles`**: Define los niveles de acceso (Ej: Administrador, Empleado).
  - *Atributos*: `id_rol` (PK), `nombre_rol`, `descripcion`.
- **`permisos`**: Define las acciones atómicas del sistema.
  - *Atributos*: `id_permiso` (PK), `nombre_permiso`.
- **`roles_permisos`**: Tabla intermedia que asocia roles con múltiples permisos.
  - *Atributos*: `id_rol` (FK), `id_permiso` (FK).
- **`configuracion_sistema`**: Parámetros globales y comportamiento de módulos.
  - *Atributos*: `id_parametro` (PK), `nombre_tienda`, `moneda`, `stock_minimo_default`, `stock_maximo_default`, `modulo_clientes_activo`, `modulo_fiados_activo`.
- **`parametros_sistema`**: Parámetros dinámicos en formato clave-valor.
  - *Atributos*: `clave` (PK), `valor`, `updated_at`.

## 2. Módulo de Inventario y Productos

Gestiona el catálogo de productos, sus categorías y unidades de medida.

### Tablas:
- **`productos`**: Entidad central del inventario.
  - *Atributos*: `id_producto` (PK), `id_categoria` (FK), `id_unidad` (FK), `codigo_barras_unico`, `nombre`, `precio_compra`, `precio_venta`, `stock_actual`, `stock_minimo`, `stock_maximo`, `permite_fraccion`, `estado`.
- **`categorias`**: Agrupación de productos.
  - *Atributos*: `id_categoria` (PK), `nombre_categoria`, `descripcion`, `estado`.
- **`unidades_medida`**: Define cómo se miden los productos (peso, volumen, unidad).
  - *Atributos*: `id_unidad` (PK), `nombre`, `abreviatura`, `tipo`, `factor_base`.
- **`codigos_barras`**: Soporte para múltiples códigos de barras por producto.
  - *Atributos*: `id_codigo` (PK), `id_producto` (FK), `codigo`.
- **`proveedores`**: Entidades que suministran los productos.
  - *Atributos*: `id_proveedor` (PK), `razon_social`, `nit_identificacion`, `telefono`, `direccion`, `correo`, `estado`.

## 3. Módulo de Movimientos y Auditoría

Rastrea cada alteración de stock y acciones sensibles en el sistema.

### Tablas:
- **`movimientos_inventario`**: Registro histórico inmutable de entradas y salidas.
  - *Atributos*: `id_movimiento` (PK), `id_producto` (FK), `id_usuario` (FK), `id_motivo` (FK), `id_proveedor` (FK), `id_factura` (FK), `cantidad`, `stock_anterior`, `stock_posterior`, `fecha_hora_exacta`.
- **`motivos_movimiento`**: Define la naturaleza del movimiento.
  - *Atributos*: `id_motivo` (PK), `nombre_motivo`, `tipo_operacion` (ENUM: `ENTRADA`, `SALIDA`, `AJUSTE`).
- **`ajustes_inventario`**: Registro específico de mermas o sobrantes.
  - *Atributos*: `id_ajuste` (PK), `id_usuario` (FK), `id_producto` (FK), `cantidad`, `tipo_ajuste`, `fecha`.
- **`auditoria_operaciones` y `auditoria_detalles`**: Registran quién, cuándo y qué campos específicos fueron modificados en el sistema para trazabilidad.

## 4. Módulo de Clientes, Ventas y Fiados

Gestión comercial del negocio, incluyendo facturación y créditos.

### Tablas:
- **`clientes`**: Directorio de clientes del negocio.
  - *Atributos*: `id_cliente` (PK), `nombre`, `documento`, `telefono`, `direccion`, `correo`, `estado`.
- **`facturas`**: Cabecera de las transacciones comerciales (ventas, devoluciones).
  - *Atributos*: `id_factura` (PK), `numero_factura`, `id_usuario` (FK), `id_cliente` (FK), `fecha_emision`, `subtotal`, `descuento`, `total`, `estado`, `tipo`.
- **`facturas_detalle`**: Líneas de artículos dentro de una factura.
  - *Atributos*: `id_detalle` (PK), `id_factura` (FK), `id_producto` (FK), `cantidad`, `precio_unitario`, `subtotal`.
- **`fiados`**: Registro de ventas a crédito (Cuentas por cobrar).
  - *Atributos*: `id_fiado` (PK), `id_cliente` (FK), `id_usuario` (FK), `id_factura` (FK), `monto_total`, `monto_pagado`, `saldo_pendiente` (Campo Calculado), `fecha_pago_acordada`, `estado` (`pendiente`, `pagado`, `vencido`).
- **`fiados_pagos`**: Abonos realizados a las cuentas por cobrar.
  - *Atributos*: `id_pago` (PK), `id_fiado` (FK), `id_usuario` (FK), `monto`, `fecha_pago`.

---

## Triggers y Funciones Relevantes (Lógica de Negocio)

1. **`actualizar_stock()`**: Trigger que se ejecuta al insertar un registro en `movimientos_inventario`. Automáticamente calcula el `stock_posterior` basado en el `stock_anterior` y la cantidad, validando la `tipo_operacion` (Entrada/Salida) e impidiendo stocks negativos mediante Excepciones. Actualiza el `stock_actual` en la tabla `productos`.
2. **`evitar_delete_movimientos()`**: Trigger restrictivo que prohíbe la eliminación de cualquier registro en la tabla `movimientos_inventario` para asegurar la inmutabilidad contable del sistema.
3. **Campos Calculados**: En la tabla `fiados`, el campo `saldo_pendiente` es generado automáticamente de forma persistente (`GENERATED ALWAYS AS (monto_total - monto_pagado) STORED`).
