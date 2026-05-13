'use strict';
 
const { sendError } = require('../utils/response');
 
/**
 * @fileoverview Middleware de manejo centralizado de errores para todos los microservicios
 * de INVENTARIO INVORY.
 *
 * Debe registrarse como el ÃšLTIMO middleware en cada app de Express:
 *
 *   app.use(errorHandler);
 *
 * Captura cualquier error que se pase mediante next(error) desde controllers,
 * servicios o middlewares anteriores, y lo convierte a la respuesta JSON
 * estandarizada del sistema (Requisito R05).
 *
 * TipologÃ­a de errores manejados:
 *   - Errores JWT (expirado, invÃ¡lido)         â†’ HTTP 401
 *   - Errores de validaciÃ³n                     â†’ HTTP 400
 *   - Errores de unicidad / conflicto           â†’ HTTP 409
 *   - Errores de no encontrado                  â†’ HTTP 404
 *   - Errores de stock insuficiente             â†’ HTTP 422
 *   - Errores de cuenta bloqueada               â†’ HTTP 423
 *   - Errores de base de datos (PostgreSQL)     â†’ HTTP 500 (sin exponer detalles internos)
 *   - Errores genÃ©ricos no controlados          â†’ HTTP 500
 *
 * @module shared/middlewares/errorHandler
 */
 
/**
 * Errores de la librerÃ­a jsonwebtoken y sus cÃ³digos HTTP correspondientes.
 * @type {Object.<string, number>}
 */
const JWT_ERROR_STATUS = {
  TokenExpiredError: 401,
  JsonWebTokenError: 401,
  NotBeforeError: 401,
};
 
/**
 * CÃ³digos de error de PostgreSQL y sus HTTP equivalentes.
 * Referencia: https://www.postgresql.org/docs/current/errcodes-appendix.html
 * @type {Object.<string, { status: number, message: string }>}
 */
const PG_ERROR_MAP = {
  '23505': { status: 409, message: 'Ya existe un registro con esos datos (violaciÃ³n de unicidad).' },
  '23503': { status: 409, message: 'No se puede completar la operaciÃ³n: referencia a un registro inexistente.' },
  '23502': { status: 400, message: 'Un campo obligatorio no puede estar vacÃ­o.' },
  '22001': { status: 400, message: 'Un valor excede la longitud mÃ¡xima permitida.' },
  '22003': { status: 400, message: 'Un valor numÃ©rico estÃ¡ fuera del rango permitido.' },
  '08006': { status: 503, message: 'Error de conexiÃ³n con la base de datos.' },
  '08001': { status: 503, message: 'No se pudo conectar a la base de datos.' },
};
 
/**
 * Determina el cÃ³digo HTTP y el mensaje de error a partir del objeto de error.
 *
 * @param {Error} err - Error capturado.
 * @returns {{ status: number, message: string, details?: * }}
 */
function resolveError(err) {
  // â”€â”€ Errores JWT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (err.name in JWT_ERROR_STATUS) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'El token ha expirado. Inicie sesiÃ³n nuevamente.'
        : 'Token invÃ¡lido o manipulado.';
    return { status: JWT_ERROR_STATUS[err.name], message };
  }
 
  // â”€â”€ Errores con statusCode ya asignado (lanzados desde servicios/controllers) â”€
  if (err.statusCode && Number.isInteger(err.statusCode)) {
    return {
      status: err.statusCode,
      message: err.message || 'Error en la solicitud.',
      details: err.details,
    };
  }
 
  // â”€â”€ Errores de PostgreSQL (pg driver) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (err.code && PG_ERROR_MAP[err.code]) {
    const { status, message } = PG_ERROR_MAP[err.code];
    return { status, message };
  }
 
  // â”€â”€ Errores de validaciÃ³n de negocio marcados explÃ­citamente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (err.name === 'ValidationError') {
    return { status: 400, message: err.message, details: err.details };
  }
 
  if (err.name === 'NotFoundError') {
    return { status: 404, message: err.message };
  }
 
  if (err.name === 'ConflictError') {
    return { status: 409, message: err.message };
  }
 
  if (err.name === 'ForbiddenError') {
    return { status: 403, message: err.message };
  }
 
  if (err.name === 'UnprocessableError') {
    return { status: 422, message: err.message, details: err.details };
  }
 
  if (err.name === 'LockedError') {
    return { status: 423, message: err.message || 'Cuenta bloqueada. Intente en 15 minutos.' };
  }
 
  // â”€â”€ Error genÃ©rico no controlado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return {
    status: 500,
    message: 'Error interno del servidor.',
  };
}
 
/**
 * Middleware de manejo centralizado de errores para Express.
 *
 * Express reconoce un error handler por su firma de 4 parÃ¡metros: (err, req, res, next).
 * Debe ser el ÃšLTIMO middleware registrado en la app.
 *
 * @param {Error}                       err  - Error capturado.
 * @param {import('express').Request}   req  - Objeto Request de Express.
 * @param {import('express').Response}  res  - Objeto Response de Express.
 * @param {import('express').NextFunction} next - FunciÃ³n next (requerida por la firma de Express).
 * @returns {void}
 *
 * @example
 * // En auth-service â†’ app.js:
 * const errorHandler = require('../../shared/middlewares/errorHandler');
 *
 * // ... rutas y middlewares anteriores ...
 *
 * app.use(errorHandler); // â† siempre al final
 *
 * @example
 * // En un controller:
 * async function login(req, res, next) {
 *   try {
 *     // ... lÃ³gica ...
 *   } catch (err) {
 *     next(err); // â† el errorHandler lo captura y responde
 *   }
 * }
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const { status, message, details } = resolveError(err);
 
  // Log interno: siempre registrar el error real en consola del servidor.
  // En producciÃ³n se deberÃ­a usar un logger estructurado (winston, pino, etc.)
  // pero para el Sprint 3 console.error es suficiente.
  const isServerError = status >= 500;
 
  if (isServerError) {
    console.error(
      `[errorHandler] ${req.method} ${req.originalUrl} â†’ HTTP ${status}`,
      err
    );
  } else {
    console.warn(
      `[errorHandler] ${req.method} ${req.originalUrl} â†’ HTTP ${status}: ${message}`
    );
  }
 
  return sendError(res, message, status, details);
}
 
// â”€â”€ Clases de error personalizadas exportadas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Los controllers y servicios de cualquier MS pueden lanzar estas clases
// y el errorHandler las mapea automÃ¡ticamente al cÃ³digo HTTP correcto.
 
/**
 * Error 400 â€” Datos de entrada invÃ¡lidos.
 * @extends Error
 * @example
 * throw new ValidationError('El campo contrasena es obligatorio.', { campo: 'contrasena' });
 */
class ValidationError extends Error {
  /**
   * @param {string} message  - Mensaje descriptivo.
   * @param {*} [details]     - Detalles adicionales (campo invÃ¡lido, regla, etc.).
   */
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}
 
/**
 * Error 404 â€” Recurso no encontrado.
 * @extends Error
 * @example
 * throw new NotFoundError('Usuario no encontrado.');
 */
class NotFoundError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}
 
/**
 * Error 409 â€” Conflicto de unicidad o integridad referencial.
 * @extends Error
 * @example
 * throw new ConflictError('El nombre de usuario ya existe.');
 */
class ConflictError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}
 
/**
 * Error 403 â€” Rol sin permiso para la operaciÃ³n.
 * @extends Error
 * @example
 * throw new ForbiddenError('Solo el Administrador puede registrar ajustes de inventario.');
 */
class ForbiddenError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
  }
}
 
/**
 * Error 422 â€” OperaciÃ³n no procesable (ej. stock insuficiente).
 * @extends Error
 * @example
 * throw new UnprocessableError('Stock insuficiente para registrar la salida.', { stock_actual: 3, cantidad_pedida: 10 });
 */
class UnprocessableError extends Error {
  /**
   * @param {string} message
   * @param {*} [details]
   */
  constructor(message, details) {
    super(message);
    this.name = 'UnprocessableError';
    this.details = details;
  }
}
 
/**
 * Error 423 â€” Cuenta bloqueada por intentos fallidos.
 * @extends Error
 * @example
 * throw new LockedError();
 */
class LockedError extends Error {
  /** @param {string} [message] */
  constructor(message = 'Cuenta bloqueada. Intente en 15 minutos.') {
    super(message);
    this.name = 'LockedError';
  }
}
 
/**
 * Error con statusCode personalizado.
 * Ãštil cuando ninguna clase especÃ­fica aplica.
 * @extends Error
 * @example
 * throw new AppError('OperaciÃ³n no permitida en este estado.', 400);
 */
class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   * @param {*} [details]
   */
  constructor(message, statusCode, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}
 
module.exports = {
  // Middleware principal
  errorHandler,
 
  // Clases de error personalizadas
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnprocessableError,
  LockedError,
  AppError,
};