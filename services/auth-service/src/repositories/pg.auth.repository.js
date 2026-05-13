'use strict';

class PgAuthRepository {
  constructor({ pool }) {
    this.pool = pool;
    this.revokedTokens = new Map();
    this.lockUntil = new Map();
  }

  async getUserByCorreo(correo) {
    const query = `
      SELECT
        u.id_usuario,
        u.correo,
        u.nombre,
        r.nombre_rol      AS rol,
        u.contrasena      AS contrasena_hash,
        u.estado,
        u.intentos_fallidos,
        u.bloqueado
      FROM usuarios u
      JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.correo = $1
      LIMIT 1
    `;
    const { rows } = await this.pool.query(query, [correo]);
    if (!rows[0]) return null;

    const row = rows[0];

    let bloqueo_hasta = this.lockUntil.get(row.id_usuario) ?? null;
    if (row.bloqueado && bloqueo_hasta === null) {
      bloqueo_hasta = Date.now() + 99 * 365 * 24 * 60 * 60 * 1000;
    }

    return {
      id_usuario:        row.id_usuario,
      correo:            row.correo,
      nombre:            row.nombre,
      rol:               row.rol,
      contrasena_hash:   row.contrasena_hash,
      estado:            row.estado === true || row.estado === 'activo' ? 'activo' : 'inactivo',
      intentos_fallidos: row.intentos_fallidos,
      bloqueo_hasta,
    };
  }

  async getUserByIdentifier(identifier) {
    return this.getUserByCorreo(identifier);
  }

  async registerFailedAttempt(user, maxLoginAttempts, lockMinutes) {
    user.intentos_fallidos += 1;

    if (user.intentos_fallidos >= maxLoginAttempts) {
      const bloqueo_hasta = Date.now() + lockMinutes * 60 * 1000;
      this.lockUntil.set(user.id_usuario, bloqueo_hasta);
      user.bloqueo_hasta = bloqueo_hasta;
      user.intentos_fallidos = 0;

      await this.pool.query(
        'UPDATE usuarios SET intentos_fallidos = 0, bloqueado = true WHERE id_usuario = $1',
        [user.id_usuario]
      );
      return { blocked: true, blockedUntil: bloqueo_hasta };
    }

    await this.pool.query(
      'UPDATE usuarios SET intentos_fallidos = $1 WHERE id_usuario = $2',
      [user.intentos_fallidos, user.id_usuario]
    );
    return { blocked: false };
  }

  async resetFailedAttempts(user) {
    this.lockUntil.delete(user.id_usuario);
    user.intentos_fallidos = 0;
    user.bloqueo_hasta = null;

    await this.pool.query(
      'UPDATE usuarios SET intentos_fallidos = 0, bloqueado = false WHERE id_usuario = $1',
      [user.id_usuario]
    );
  }

  async revokeToken(token, expiresAtMs) {
    this.revokedTokens.set(token, expiresAtMs);
  }

  async isTokenRevoked(token) {
    const expiresAt = this.revokedTokens.get(token);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.revokedTokens.delete(token);
      return false;
    }
    return true;
  }
}

module.exports = { PgAuthRepository };
