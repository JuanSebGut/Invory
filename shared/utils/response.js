'use strict';
 
/**
 * @fileoverview Helpers para respuestas HTTP estandarizadas en todos los microservicios
 * de INVENTARIO INVORY.
 *
 * Garantiza que TODA respuesta JSON del sistema siga el mismo contrato (Requisito R05):
 *   - Ã‰xito:  { success: true,  data: <payload>,  message?: <string> }
 *   - Error:  { success: false, error: <string>,  details?: <any>    }
 *
 * @module shared/utils/response
 */
 
/**
 * EnvÃ­a una respuesta HTTP de Ã©xito estandarizada.
 *
 * @param {import('express').Response} res  - Objeto Response de Express.
 * @param {*}       data                    - Payload principal de la respuesta (objeto, array, etc.).
 * @param {number}  [statusCode=200]        - CÃ³digo HTTP de Ã©xito (200, 201, etc.).
 * @param {string}  [message]               - Mensaje descriptivo opcional (ej. 'Usuario creado correctamente').
 * @returns {import('express').Response} La respuesta enviada.
 *
 * @example
 * // En auth-service â†’ controller de login â†’ HTTP 200
 * const { sendSuccess } = require('../../shared/utils/response');
 *
 * sendSuccess(res, { token, id_usuario, rol, nombre });
 *
 * // Respuesta JSON:
 * // { "success": true, "data": { "token": "...", "id_usuario": 1, "rol": "Administrador", "nombre": "Juan" } }
 *
 * @example
 * // CreaciÃ³n de usuario â†’ HTTP 201
 * sendSuccess(res, null, 201, 'Usuario creado correctamente');
 *
 * // Respuesta JSON:
 * // { "success": true, "data": null, "message": "Usuario creado correctamente" }
 */
function sendSuccess(res, data, statusCode = 200, message) {
  const body = { success: true, data };
 
  if (message) {
    body.message = message;
  }
 
  return res.status(statusCode).json(body);
}
 
/**
 * EnvÃ­a una respuesta HTTP de error estandarizada.
 *
 * @param {import('express').Response} res  - Objeto Response de Express.
 * @param {string}  errorMessage            - Mensaje de error legible por el cliente.
 * @param {number}  [statusCode=500]        - CÃ³digo HTTP de error.
 * @param {*}       [details]               - Detalles adicionales del error (campo invÃ¡lido, etc.).
 *                                           No incluir stack traces en producciÃ³n.
 * @returns {import('express').Response} La respuesta enviada.
 *
 * @example
 * // Credenciales incorrectas â†’ HTTP 401
 * const { sendError } = require('../../shared/utils/response');
 *
 * sendError(res, 'Usuario o contraseÃ±a incorrectos', 401);
 *
 * // Respuesta JSON:
 * // { "success": false, "error": "Usuario o contraseÃ±a incorrectos" }
 *
 * @example
 * // ValidaciÃ³n fallida con detalles â†’ HTTP 400
 * sendError(res, 'Error de validaciÃ³n', 400, { campo: 'contrasena', mensaje: 'MÃ­nimo 8 caracteres' });
 *
 * // Respuesta JSON:
 * // { "success": false, "error": "Error de validaciÃ³n", "details": { ... } }
 */
function sendError(res, errorMessage, statusCode = 500, details) {
  const body = { success: false, error: errorMessage };
 
  if (details !== undefined && details !== null) {
    body.details = details;
  }
 
  return res.status(statusCode).json(body);
}
 
// â”€â”€â”€ Shortcuts para los cÃ³digos HTTP mÃ¡s usados en el sistema â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 
/**
 * HTTP 200 OK â€” Consulta o actualizaciÃ³n exitosa.
 * @param {import('express').Response} res
 * @param {*} data
 * @param {string} [message]
 */
const ok = (res, data, message) => sendSuccess(res, data, 200, message);
 
/**
 * HTTP 201 Created â€” Recurso creado exitosamente.
 * @param {import('express').Response} res
 * @param {*} data
 * @param {string} [message]
 */
const created = (res, data, message) => sendSuccess(res, data, 201, message);
 
/**
 * HTTP 400 Bad Request â€” Datos de entrada invÃ¡lidos o faltantes.
 * @param {import('express').Response} res
 * @param {string} [message='Solicitud invÃ¡lida']
 * @param {*} [details]
 */
const badRequest = (res, message = 'Solicitud invÃ¡lida', details) =>
  sendError(res, message, 400, details);
 
/**
 * HTTP 401 Unauthorized â€” Token ausente, expirado o invÃ¡lido.
 * SegÃºn R01: "Si el token estÃ¡ ausente, expirado o es invÃ¡lido, se retorna HTTP 401."
 * @param {import('express').Response} res
 * @param {string} [message='No autorizado']
 */
const unauthorized = (res, message = 'No autorizado') =>
  sendError(res, message, 401);
 
/**
 * HTTP 403 Forbidden â€” Token vÃ¡lido pero el rol no tiene permiso.
 * SegÃºn R02: "Si el token es vÃ¡lido pero el rol no tiene permiso, se retorna HTTP 403."
 * @param {import('express').Response} res
 * @param {string} [message='No tiene permisos para esta operaciÃ³n']
 */
const forbidden = (res, message = 'No tiene permisos para esta operaciÃ³n') =>
  sendError(res, message, 403);
 
/**
 * HTTP 404 Not Found â€” Recurso no encontrado.
 * @param {import('express').Response} res
 * @param {string} [message='Recurso no encontrado']
 */
const notFound = (res, message = 'Recurso no encontrado') =>
  sendError(res, message, 404);
 
/**
 * HTTP 409 Conflict â€” Conflicto de unicidad (usuario, categorÃ­a, cÃ³digo de barras, etc.).
 * @param {import('express').Response} res
 * @param {string} [message='Conflicto con un recurso existente']
 */
const conflict = (res, message = 'Conflicto con un recurso existente') =>
  sendError(res, message, 409);
 
/**
 * HTTP 422 Unprocessable Entity â€” Datos semÃ¡nticamente invÃ¡lidos
 * (ej. stock insuficiente para una salida de inventario).
 * SegÃºn MS-05: "422 (stock insuficiente)."
 * @param {import('express').Response} res
 * @param {string} [message='No se puede procesar la operaciÃ³n']
 * @param {*} [details]
 */
const unprocessable = (res, message = 'No se puede procesar la operaciÃ³n', details) =>
  sendError(res, message, 422, details);
 
/**
 * HTTP 423 Locked â€” Cuenta bloqueada por intentos fallidos.
 * SegÃºn MS-01 y R03: "HTTP 423: 'Cuenta bloqueada. Intente en 15 minutos'."
 * @param {import('express').Response} res
 * @param {string} [message='Cuenta bloqueada. Intente en 15 minutos']
 */
const locked = (res, message = 'Cuenta bloqueada. Intente en 15 minutos') =>
  sendError(res, message, 423);
 
/**
 * HTTP 500 Internal Server Error â€” Error inesperado del servidor.
 * @param {import('express').Response} res
 * @param {string} [message='Error interno del servidor']
 */
const internalError = (res, message = 'Error interno del servidor') =>
  sendError(res, message, 500);
 
module.exports = {
  // Funciones base
  sendSuccess,
  sendError,
 
  // Shortcuts por cÃ³digo HTTP
  ok,
  created,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  locked,
  internalError,
};