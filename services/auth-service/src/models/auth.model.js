function createHttpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function validateLoginPayload(body) {
  if (!body || typeof body !== 'object') {
    throw createHttpError(400, 'VALIDATION_ERROR', 'El cuerpo de la solicitud es obligatorio');
  }

  const correo = body.correo || body.nombre_usuario || body.nombreUsuario;
  const { contrasena } = body;
  if (!correo || !contrasena) {
    throw createHttpError(
      400,
      'VALIDATION_ERROR',
      'correo o nombre_usuario y contrasena son obligatorios'
    );
  }

  return { correo, contrasena };
}

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') {
    throw createHttpError(401, 'AUTH_TOKEN_MISSING', 'Token de autorizaciÃ³n no proporcionado');
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw createHttpError(401, 'AUTH_TOKEN_INVALID', 'Formato de token invÃ¡lido');
  }

  return token;
}

module.exports = {
  createHttpError,
  validateLoginPayload,
  extractBearerToken,
};
