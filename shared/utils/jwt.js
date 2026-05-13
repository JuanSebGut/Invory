'use strict';
 
const jwt = require('jsonwebtoken');
 
/**
 * @fileoverview Utilidades JWT compartidas para todos los microservicios de INVENTARIO INVORY.
 * Provee generaciÃƒÂ³n y verificaciÃƒÂ³n de tokens JWT firmados con HS256.
 *
 * Usado por:
 *  - MS-01 auth-service   Ã¢â€ â€™ genera el token en POST /api/auth/login
 *  - API Gateway          Ã¢â€ â€™ verifica el token en GET /verify (auth.middleware.js)
 *  - Cualquier MS futuro  Ã¢â€ â€™ puede verificar tokens localmente si lo requiere
 *
 * @module shared/utils/jwt
 */
 
/**
 * Clave secreta usada para firmar y verificar tokens JWT.
 * DEBE estar definida en la variable de entorno JWT_SECRET.
 * Si no estÃƒÂ¡ definida, se lanza un error en tiempo de arranque.
 *
 * @type {string}
 */
const JWT_SECRET = process.env.JWT_SECRET;
 
if (!JWT_SECRET) {
  throw new Error(
    '[shared/utils/jwt] La variable de entorno JWT_SECRET no estÃƒÂ¡ definida. ' +
    'El servicio no puede arrancar sin una clave secreta.'
  );
}
 
/**
 * Tiempo de expiraciÃƒÂ³n del token en segundos.
 * Por requisito R04 del sistema: 30 minutos de inactividad.
 * Puede sobreescribirse con la variable de entorno JWT_EXPIRES_IN.
 *
 * @type {string}
 */
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30m';
 
/**
 * Genera un token JWT firmado con el payload del usuario autenticado.
 *
 * El payload sigue exactamente el contrato definido en MS-01:
 * { id_usuario, rol, nombre }
 *
 * @param {Object} payload           - Datos del usuario a incluir en el token.
 * @param {number} payload.id_usuario - ID ÃƒÂºnico del usuario en la base de datos.
 * @param {string} payload.rol        - Rol del usuario ('Administrador' | 'Empleado').
 * @param {string} payload.nombre     - Nombre del usuario para mostrar en UI.
 * @returns {string} Token JWT firmado, listo para enviarse al cliente.
 *
 * @throws {Error} Si el payload es invÃƒÂ¡lido o si falla la firma (ej. secret ausente).
 *
 * @example
 * // En auth-service Ã¢â€ â€™ controller de login:
 * const { generateToken } = require('../../shared/utils/jwt');
 *
 * const token = generateToken({
 *   id_usuario: 1,
 *   rol: 'Administrador',
 *   nombre: 'Juan PÃƒÂ©rez'
 * });
 * // Ã¢â€ â€™ "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 */
function generateToken(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('[jwt.generateToken] El payload debe ser un objeto vÃƒÂ¡lido.');
  }
 
  const { id_usuario, rol, nombre } = payload;
 
  if (id_usuario === undefined || id_usuario === null) {
    throw new Error('[jwt.generateToken] El campo id_usuario es obligatorio en el payload.');
  }
  if (!rol) {
    throw new Error('[jwt.generateToken] El campo rol es obligatorio en el payload.');
  }
  if (!nombre) {
    throw new Error('[jwt.generateToken] El campo nombre es obligatorio en el payload.');
  }
 
  // Solo se incluyen los campos del contrato MS-01; se evita
  // filtrar datos sensibles como contraseÃƒÂ±as si llegasen por error.
  const tokenPayload = { id_usuario, rol, nombre };
 
  return jwt.sign(tokenPayload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256',
  });
}
 
/**
 * Verifica y decodifica un token JWT.
 *
 * Usado principalmente por el API Gateway en auth.middleware.js
 * para validar el token antes de enrutar la peticiÃƒÂ³n al microservicio destino.
 *
 * @param {string} token - Token JWT en crudo (sin el prefijo 'Bearer ').
 * @returns {{ id_usuario: number, rol: string, nombre: string, iat: number, exp: number }}
 *   Payload decodificado si el token es vÃƒÂ¡lido y no ha expirado.
 *
 * @throws {jwt.TokenExpiredError} Si el token expirÃƒÂ³. El gateway debe responder HTTP 401.
 * @throws {jwt.JsonWebTokenError}  Si el token es invÃƒÂ¡lido o fue manipulado. HTTP 401.
 * @throws {jwt.NotBeforeError}     Si el token aÃƒÂºn no es vÃƒÂ¡lido. HTTP 401.
 * @throws {Error}                  Si el argumento no es un string.
 *
 * @example
 * // En API Gateway Ã¢â€ â€™ auth.middleware.js:
 * const { verifyToken } = require('../../shared/utils/jwt');
 *
 * try {
 *   const decoded = verifyToken(token);
 *   req.user = decoded; // { id_usuario, rol, nombre }
 *   next();
 * } catch (err) {
 *   // El gateway responde HTTP 401
 * }
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('[jwt.verifyToken] El token debe ser un string no vacÃƒÂ­o.');
  }
 
  // jwt.verify lanza excepciones especÃƒÂ­ficas; el caller decide el HTTP code.
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}
 
/**
 * Decodifica un token JWT SIN verificar la firma ni la expiraciÃƒÂ³n.
 *
 * Ã¢Å¡Â Ã¯Â¸Â  ADVERTENCIA: No usar para autenticaciÃƒÂ³n. Solo ÃƒÂºtil para inspeccionar
 * el payload de un token invÃƒÂ¡lido o expirado en contextos de depuraciÃƒÂ³n
 * o logging, donde ya sabemos que el token fallÃƒÂ³ la verificaciÃƒÂ³n.
 *
 * @param {string} token - Token JWT en crudo.
 * @returns {Object|null} Payload decodificado, o null si el formato es invÃƒÂ¡lido.
 *
 * @example
 * // En logging de intentos fallidos:
 * const { decodeToken } = require('../../shared/utils/jwt');
 * const payload = decodeToken(expiredToken);
 * console.log('Intento con usuario:', payload?.id_usuario);
 */
function decodeToken(token) {
  if (!token || typeof token !== 'string') return null;
  return jwt.decode(token);
}
 
module.exports = {
  generateToken,
  verifyToken,
  decodeToken,
};
