class InMemoryAuthRepository {
  constructor({ users = [] } = {}) {
    this.usersByCorreo = new Map();
    this.usersByUsername = new Map();
    this.usersById = new Map();
    this.revokedTokens = new Map();

    users.forEach((user) => {
      this.usersByCorreo.set(user.correo, { ...user });
      this.usersById.set(user.id_usuario, this.usersByCorreo.get(user.correo));
      if (user.nombre_usuario) {
        this.usersByUsername.set(user.nombre_usuario, this.usersByCorreo.get(user.correo));
      }
    });
  }

  async getUserByCorreo(correo) {
    return this.usersByCorreo.get(correo) || null;
  }

  async getUserByIdentifier(identifier) {
    return this.usersByCorreo.get(identifier) || this.usersByUsername.get(identifier) || null;
  }

  async registerFailedAttempt(user, maxLoginAttempts, lockMinutes) {
    user.intentos_fallidos += 1;

    if (user.intentos_fallidos >= maxLoginAttempts) {
      user.bloqueo_hasta = Date.now() + lockMinutes * 60 * 1000;
      user.intentos_fallidos = 0;
      return { blocked: true, blockedUntil: user.bloqueo_hasta };
    }

    return { blocked: false };
  }

  async resetFailedAttempts(user) {
    user.intentos_fallidos = 0;
    user.bloqueo_hasta = null;
  }

  async revokeToken(token, expiresAtMs) {
    this.revokedTokens.set(token, expiresAtMs);
  }

  async isTokenRevoked(token) {
    const expiresAt = this.revokedTokens.get(token);
    if (!expiresAt) {
      return false;
    }

    if (Date.now() > expiresAt) {
      this.revokedTokens.delete(token);
      return false;
    }

    return true;
  }
}

module.exports = { InMemoryAuthRepository };
