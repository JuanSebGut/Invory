function createAuthMiddleware({ authServiceUrl, fetchImpl = fetch }) {
  return async function authMiddleware(req, res, next) {
    try {
      const authorization = req.headers.authorization;
      if (!authorization) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_TOKEN_MISSING',
            message: 'Token de autorizacion no proporcionado',
          },
        });
      }

      const response = await fetchImpl(`${authServiceUrl}/api/auth/verify`, {
        method: 'GET',
        headers: {
          Authorization: authorization,
        },
      });

      const payload = await response.json();
      if (!response.ok) {
        return res.status(response.status).json(payload);
      }

      req.authUser = payload.data;
      return next();
    } catch (_error) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'AUTH_SERVICE_UNAVAILABLE',
          message: 'No fue posible validar el token con el servicio de autenticacion',
        },
      });
    }
  };
}

module.exports = { createAuthMiddleware };
