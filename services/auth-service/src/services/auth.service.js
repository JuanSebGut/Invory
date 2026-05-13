const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { createHttpError } = require('../models/auth.model');

function parseExpiresToSeconds(expiresIn) {
  if (typeof expiresIn === 'number') {
    return expiresIn;
  }

  if (typeof expiresIn === 'string' && expiresIn.endsWith('m')) {
    return Number(expiresIn.replace('m', '')) * 60;
  }

  if (typeof expiresIn === 'string' && expiresIn.endsWith('h')) {
    return Number(expiresIn.replace('h', '')) * 3600;
  }

  return 1800;
}

class AuthService {
  constructor({
    repository,
    auditNotifier = {
      notifyLoginSuccess: async () => {},
      notifyLoginFailure: async () => {},
    },
    jwtSecret,
    jwtExpiresIn = '30m',
    maxLoginAttempts = 3,
    lockMinutes = 15,
  }) {
    this.repository = repository;
    this.auditNotifier = auditNotifier;
    this.jwtSecret = jwtSecret;
    this.jwtExpiresIn = jwtExpiresIn;
    this.maxLoginAttempts = maxLoginAttempts;
    this.lockMinutes = lockMinutes;
  }

  signToken(user) {
    return jwt.sign(
      {
        id_usuario: user.id_usuario,
        rol: user.rol,
        nombre: user.nombre,
        jti: randomUUID(),
      },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn }
    );
  }

  decodeWithoutVerification(token) {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return null;
    }
    return decoded;
  }

  async login({ correo, contrasena }) {
    const user = this.repository.getUserByIdentifier
      ? await this.repository.getUserByIdentifier(correo)
      : await this.repository.getUserByCorreo(correo);

    if (!user || user.estado !== 'activo') {
      void this.auditNotifier
        .notifyLoginFailure({
          identifier: correo,
          reason: 'credenciales_invalidas',
        })
        .catch(() => {});
      throw createHttpError(401, 'AUTH_INVALID_CREDENTIALS', 'Correo o contrasena incorrectos');
    }

    if (user.bloqueo_hasta && Date.now() < user.bloqueo_hasta) {
      void this.auditNotifier
        .notifyLoginFailure({
          user,
          identifier: correo,
          reason: 'cuenta_bloqueada',
        })
        .catch(() => {});
      throw createHttpError(423, 'AUTH_ACCOUNT_BLOCKED', 'Cuenta bloqueada. Intente en 15 minutos');
    }

    const validPassword = await bcrypt.compare(contrasena, user.contrasena_hash);
    if (!validPassword) {
      const failed = await this.repository.registerFailedAttempt(
        user,
        this.maxLoginAttempts,
        this.lockMinutes
      );

      void this.auditNotifier
        .notifyLoginFailure({
          user,
          identifier: correo,
          reason: failed.blocked ? 'cuenta_bloqueada' : 'credenciales_invalidas',
        })
        .catch(() => {});

      if (failed.blocked) {
        throw createHttpError(423, 'AUTH_ACCOUNT_BLOCKED', 'Cuenta bloqueada. Intente en 15 minutos');
      }

      throw createHttpError(401, 'AUTH_INVALID_CREDENTIALS', 'Correo o contrasena incorrectos');
    }

    await this.repository.resetFailedAttempts(user);
    const token = this.signToken(user);
    const decoded = jwt.decode(token);

    void this.auditNotifier
      .notifyLoginSuccess({
        user,
        identifier: correo,
        sessionId: decoded?.jti || null,
      })
      .catch(() => {});

    return {
      token,
      id_usuario: user.id_usuario,
      nombre: user.nombre,
      rol: user.rol,
      expires_in: parseExpiresToSeconds(this.jwtExpiresIn),
    };
  }

  async verify(token) {
    const revoked = await this.repository.isTokenRevoked(token);
    if (revoked) {
      throw createHttpError(401, 'AUTH_TOKEN_REVOKED', 'Token revocado');
    }

    try {
      const payload = jwt.verify(token, this.jwtSecret);
      return {
        valid: true,
        id_usuario: payload.id_usuario,
        nombre: payload.nombre,
        rol: payload.rol,
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw createHttpError(401, 'AUTH_TOKEN_EXPIRED', 'Token expirado');
      }
      throw createHttpError(401, 'AUTH_TOKEN_INVALID', 'Token invalido');
    }
  }

  async logout(token) {
    const decoded = this.decodeWithoutVerification(token);
    if (!decoded) {
      throw createHttpError(401, 'AUTH_TOKEN_INVALID', 'Token invalido');
    }

    await this.repository.revokeToken(token, decoded.exp * 1000);
    return { message: 'Sesion cerrada correctamente' };
  }

  async refresh(token) {
    const currentPayload = await this.verify(token);
    const decoded = this.decodeWithoutVerification(token);

    await this.repository.revokeToken(token, decoded.exp * 1000);

    const newToken = this.signToken(currentPayload);
    return {
      token: newToken,
      expires_in: parseExpiresToSeconds(this.jwtExpiresIn),
    };
  }
}

module.exports = { AuthService };
