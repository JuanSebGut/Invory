'use strict';
 
/**
 * @fileoverview Constantes de roles del sistema INVENTARIO INVORY.
 *
 * El sistema define exactamente dos roles (Requisito R02):
 *   - Administrador: acceso total a todas las funcionalidades.
 *   - Operador:      acceso restringido (consultas, entradas y salidas; NO ajustes).
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
 *   - GestiÃ³n de usuarios (MS-02)
 *   - Registro de ajustes de inventario (MS-05)
 *   - Consulta del log de auditorÃ­a (MS-09)
 *   - ConfiguraciÃ³n del sistema (MS-11)
 *   - GeneraciÃ³n de reportes y exportaciones (MS-07, MS-12)
 *
 * @type {string}
 * @constant
 */
const ADMINISTRADOR = 'Administrador';
 
/**
 * Rol Operador.
 * Tiene acceso restringido. Puede:
 *   - Consultar productos, categorÃ­as y alertas de stock (MS-03, MS-04, MS-06)
 *   - Registrar ENTRADAS y SALIDAS de inventario (MS-05)
 *   - Visualizar reportes predefinidos (MS-07)
 *
 * NO puede:
 *   - Registrar AJUSTES de inventario (MS-05 â†’ HTTP 403)
 *   - Acceder a configuraciÃ³n del sistema (MS-11 â†’ HTTP 403)
 *   - Consultar el log de auditorÃ­a (MS-09 â†’ HTTP 403)
 *   - Gestionar usuarios (MS-02 â†’ HTTP 403)
 *
 * @type {string}
 * @constant
 */
const OPERADOR = 'Operador';
 
/**
 * Array con todos los roles vÃ¡lidos del sistema.
 * Ãštil para validaciÃ³n: si el rol del token no estÃ¡ en esta lista, es invÃ¡lido.
 *
 * @type {string[]}
 * @constant
 *
 * @example
 * const { ALL_ROLES } = require('../../shared/constants/roles');
 *
 * if (!ALL_ROLES.includes(req.user.rol)) {
 *   return forbidden(res, 'Rol no reconocido');
 * }
 */
const ALL_ROLES = [ADMINISTRADOR, OPERADOR];
 
/**
 * Mapa de permisos por operaciÃ³n.
 * Define quÃ© roles pueden ejecutar cada tipo de operaciÃ³n crÃ­tica del sistema.
 * Facilita checks de autorizaciÃ³n sin strings dispersos en el cÃ³digo.
 *
 * @type {Object.<string, string[]>}
 * @constant
 *
 * @example
 * const { PERMISOS } = require('../../shared/constants/roles');
 *
 * // En MS-05 â†’ verificar que el rol puede registrar ajustes:
 * if (!PERMISOS.REGISTRAR_AJUSTE.includes(req.user.rol)) {
 *   return forbidden(res, 'Solo el Administrador puede registrar ajustes de inventario');
 * }
 */
const PERMISOS = {
  /** Solo Administrador puede registrar ajustes de inventario (Requisito R14). */
  REGISTRAR_AJUSTE: [ADMINISTRADOR],
 
  /** Administrador y Operador pueden registrar entradas y salidas. */
  REGISTRAR_MOVIMIENTO: [ADMINISTRADOR, OPERADOR],
 
  /** Solo Administrador puede gestionar usuarios (MS-02). */
  GESTIONAR_USUARIOS: [ADMINISTRADOR],
 
  /** Solo Administrador puede consultar el log de auditorÃ­a (MS-09). */
  VER_AUDITORIA: [ADMINISTRADOR],
 
  /** Solo Administrador puede modificar la configuraciÃ³n del sistema (MS-11). */
  CONFIGURAR_SISTEMA: [ADMINISTRADOR],
 
  /** Ambos roles pueden consultar productos, categorÃ­as y alertas. */
  CONSULTAR_INVENTARIO: [ADMINISTRADOR, OPERADOR],
 
  /** Ambos roles pueden ver reportes predefinidos (MS-07). */
  VER_REPORTES: [ADMINISTRADOR, OPERADOR],
 
  /** Solo Administrador puede exportar datos (MS-12). */
  EXPORTAR_DATOS: [ADMINISTRADOR],
 
  /** Solo Administrador puede desbloquear cuentas (R16, MS-02). */
  DESBLOQUEAR_CUENTA: [ADMINISTRADOR],
};
 
module.exports = {
  ADMINISTRADOR,
  OPERADOR,
  ALL_ROLES,
  PERMISOS,
};
