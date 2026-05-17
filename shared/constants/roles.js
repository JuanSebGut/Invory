'use strict';
 
/**
 * @fileoverview Constantes de roles del sistema INVENTARIO INVORY.
 *
 * El sistema define exactamente dos roles (Requisito R02):
 *   - Administrador: acceso total a todas las funcionalidades.
 *   - Empleado:      acceso restringido (consultas, entradas y salidas; NO ajustes).
 *
 * Estas constantes deben usarse en TODOS los microservicios al validar permisos
 * (auth-service, API Gateway, MS-02, MS-05, MS-09, etc.) para evitar strings
 * literales dispersos que generen inconsistencias.
 *
 * @module shared/constants/roles
 */
 
/**
 * Rol Administrador.
 * Tiene acceso total a todas las funcionalidades del sistema, incluyendo:
 *   - Gestión de usuarios (MS-02)
 *   - Registro de ajustes de inventario (MS-05)
 *   - Consulta del log de auditoría (MS-09)
 *   - Configuración del sistema (MS-11)
 *   - Generación de reportes y exportaciones (MS-07, MS-12)
 *
 * @type {string}
 * @constant
 */
const ADMINISTRADOR = 'Administrador';
 
/**
 * Rol Empleado.
 * Tiene acceso operacional completo. Puede:
 *   - Ver el Dashboard (KPIs: ventas hoy, alertas, movimientos, valor inventario)
 *   - Ver y gestionar clientes: listar, ver detalle, crear, editar (NO borrar)
 *   - Ver y gestionar productos: listar, ver detalle, crear, editar (NO borrar)
 *   - Registrar ENTRADAS y SALIDAS de inventario (MS-05)
 *   - Ver facturas (listar y detalle)
 *   - Crear facturas (necesario para el flujo de ventas)
 *   - Ver historial de movimientos de inventario
 *   - Visualizar reportes operacionales: movimientos, ventas, stock,
 *     sin movimiento, por categoría (MS-07). NO puede imprimir/exportar.
 *   - Ver alertas de stock (MS-06)
 *   - Registrar fiados y pagos de fiados
 *
 * NO puede:
 *   - Registrar AJUSTES de inventario (MS-05 -> HTTP 403)
 *   - Acceder a configuración del sistema (MS-11 -> HTTP 403)
 *   - Consultar el log de auditoría (MS-09 -> HTTP 403)
 *   - Gestionar usuarios (MS-02 -> HTTP 403)
 *   - Eliminar clientes o productos (-> HTTP 403)
 *   - Exportar/imprimir reportes (MS-12 -> HTTP 403)
 *   - Ver reportes de Rentabilidad o Comparativo (financiero sensible)
 *   - Anular facturas (-> HTTP 403)
 *
 * @type {string}
 * @constant
 */
const EMPLEADO = 'Empleado';
// Alias retrocompatible para importaciones antiguas.
const OPERADOR = EMPLEADO;
 
/**
 * Array con todos los roles válidos del sistema.
 * Útil para validación: si el rol del token no está en esta lista, es inválido.
 *
 * @type {string[]}
 * @constant
 */
const ALL_ROLES = [ADMINISTRADOR, EMPLEADO];
 
/**
 * Mapa de permisos por operación.
 * Define qué roles pueden ejecutar cada tipo de operación crítica del sistema.
 * Facilita checks de autorización sin strings dispersos en el código.
 *
 * @type {Object.<string, string[]>}
 * @constant
 */
const PERMISOS = {
  /** Solo Administrador puede registrar ajustes de inventario (Requisito R14). */
  REGISTRAR_AJUSTE: [ADMINISTRADOR],

  /** Administrador y Empleado pueden registrar entradas y salidas. */
  REGISTRAR_MOVIMIENTO: [ADMINISTRADOR, EMPLEADO],

  /** Solo Administrador puede gestionar usuarios (MS-02). */
  GESTIONAR_USUARIOS: [ADMINISTRADOR],

  /** Solo Administrador puede consultar el log de auditoría (MS-09). */
  VER_AUDITORIA: [ADMINISTRADOR],

  /** Solo Administrador puede modificar la configuración del sistema (MS-11). */
  CONFIGURAR_SISTEMA: [ADMINISTRADOR],

  /** Ambos roles pueden consultar productos, categorías y alertas. */
  CONSULTAR_INVENTARIO: [ADMINISTRADOR, EMPLEADO],

  /** Ambos roles pueden ver reportes operacionales (MS-07). */
  VER_REPORTES: [ADMINISTRADOR, EMPLEADO],

  /** Solo Administrador puede exportar/imprimir datos (MS-12). */
  EXPORTAR_DATOS: [ADMINISTRADOR],

  /** Solo Administrador puede desbloquear cuentas (R16, MS-02). */
  DESBLOQUEAR_CUENTA: [ADMINISTRADOR],

  /** Solo Administrador puede resetear contraseñas de terceros. */
  RESET_PASSWORD_USUARIO: [ADMINISTRADOR],

  /** Ambos pueden listar, ver, crear y editar clientes. */
  CONSULTAR_CLIENTES: [ADMINISTRADOR, EMPLEADO],
  CREAR_CLIENTE:     [ADMINISTRADOR, EMPLEADO],
  EDITAR_CLIENTE:    [ADMINISTRADOR, EMPLEADO],

  /** Solo Administrador puede eliminar clientes. */
  ELIMINAR_CLIENTE: [ADMINISTRADOR],

  /** Ambos pueden listar, ver, crear y editar productos. */
  CONSULTAR_PRODUCTOS: [ADMINISTRADOR, EMPLEADO],
  CREAR_PRODUCTO:      [ADMINISTRADOR, EMPLEADO],
  EDITAR_PRODUCTO:     [ADMINISTRADOR, EMPLEADO],

  /** Solo Administrador puede eliminar productos. */
  ELIMINAR_PRODUCTO: [ADMINISTRADOR],

  /** Ambos pueden ver y crear facturas. Solo Admin puede anular. */
  VER_FACTURAS:    [ADMINISTRADOR, EMPLEADO],
  CREAR_FACTURA:   [ADMINISTRADOR, EMPLEADO],
  ANULAR_FACTURA:  [ADMINISTRADOR],

  /** Empleado y Administrador pueden registrar fiados/pagos. */
  REGISTRAR_FIADO:      [ADMINISTRADOR, EMPLEADO],
  REGISTRAR_PAGO_FIADO: [ADMINISTRADOR, EMPLEADO],
};

/**
 * Matriz de rutas permitidas para rol Empleado en el API Gateway.
 * Se usa como referencia central del contrato de autorización.
 */
const MATRIZ_PERMISOS_EMPLEADO = Object.freeze({
  ALLOW: [
    // Dashboard
    'GET /api/inventory/movements       (KPIs: movimientos hoy, ultimos movimientos)',
    'GET /api/inventory/alerts          (alertas de stock)',
    'GET /api/inventory/reports/movements',
    'GET /api/inventory/reports/sales',
    'GET /api/inventory/reports/stock',
    'GET /api/inventory/reports/no-movement',
    'GET /api/inventory/reports/by-category',
    // Clientes - CRUD completo excepto DELETE
    'GET  /api/clients',
    'GET  /api/clients/:id',
    'POST /api/clients',
    'PUT  /api/clients/:id',
    'PATCH /api/clients/:id/status',
    'GET  /api/clients/:id/fiados',
    'POST /api/clients/:id/fiados',
    'POST /api/fiados/:id/pagos',
    'GET  /api/fiados/alertas',
    // Productos - CRUD completo excepto DELETE
    'GET  /api/products',
    'GET  /api/products/:id',
    'POST /api/products',
    'PUT  /api/products/:id',
    // Inventario - Entradas y Salidas (NO ajustes)
    'POST /api/inventory/movements      (tipo ENTRADA o SALIDA)',
    // Facturas - Ver y Crear (para flujo de venta)
    'GET  /api/inventory/facturas',
    'GET  /api/inventory/facturas/:id',
    'POST /api/inventory/facturas       (necesario para procesar ventas)',
    // Historial de movimientos
    'GET  /api/inventory/movements      (con filtros de fecha/producto/tipo)',
    // Mi perfil
    'GET  /api/users/me',
  ],
  DENY: [
    'POST /api/inventory/movements      tipo AJUSTE  -> HTTP 403',
    'GET  /api/inventory/reports/profits             -> HTTP 403',
    'GET  /api/inventory/reports/comparative         -> HTTP 403',
    'PATCH /api/inventory/facturas/:id/anular        -> HTTP 403',
    '/api/audit/logs                                 -> HTTP 403',
    '/api/export                                     -> HTTP 403',
    '/api/users  (excepto GET /api/users/me)         -> HTTP 403',
    '/api/providers                                  -> HTTP 403',
    'POST|PUT|DELETE /api/categories*               -> HTTP 403',
    'DELETE /api/clients/:id                         -> HTTP 403',
    'DELETE /api/products/:id                        -> HTTP 403',
  ],
});
 
module.exports = {
  ADMINISTRADOR,
  EMPLEADO,
  OPERADOR,
  ALL_ROLES,
  PERMISOS,
  MATRIZ_PERMISOS_EMPLEADO,
};
