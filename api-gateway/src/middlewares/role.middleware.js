function requireRoles(allowedRoles) {
  return function roleGuard(req, res, next) {
    const role = String(req.authUser?.rol || '').trim().toLowerCase();
    const rolesLower = allowedRoles.map(r => String(r).trim().toLowerCase());

    if (!rolesLower.includes(role)) {
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