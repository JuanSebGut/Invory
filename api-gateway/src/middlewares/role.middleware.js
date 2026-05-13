function requireRoles(allowedRoles) {
  return function roleGuard(req, res, next) {
    const role = req.authUser?.rol;

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'AUTH_FORBIDDEN',
          message: 'No tiene permisos para esta operacion',
        },
      });
    }

    return next();
  };
}

module.exports = { requireRoles };