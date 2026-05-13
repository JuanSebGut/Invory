const bcrypt = require('bcryptjs');
const { createHttpError } = require('../models/user.model');

function isAdminRole(role) {
  if (!role) {
    return false;
  }

  const normalized = String(role).trim().toLowerCase();
  return normalized === 'admin' || normalized === 'administrador';
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const { contrasena, ...safeUser } = user;
  return safeUser;
}

class UserService {
  constructor({
    repository,
    auditNotifier = {
      notifyUserCreated: async () => {},
      notifyUserUpdated: async () => {},
      notifyUserDisabled: async () => {},
    },
    bcryptSaltRounds = 10,
  }) {
    this.repository = repository;
    this.auditNotifier = auditNotifier;
    this.bcryptSaltRounds = bcryptSaltRounds;
  }

  async createUser(payload, actorContext = {}) {
    const existing = await this.repository.getUserByCorreo(payload.correo);
    if (existing) {
      throw createHttpError(409, 'USER_EMAIL_ALREADY_EXISTS', 'El correo ya esta registrado');
    }

    const contrasena = await bcrypt.hash(payload.contrasena, this.bcryptSaltRounds);

    const created = await this.repository.createUser({
      id_rol: payload.id_rol,
      nombre: payload.nombre,
      correo: payload.correo,
      contrasena,
      estado: payload.estado,
    });

    const safeUser = sanitizeUser(created);
    void this.auditNotifier
      .notifyUserCreated({
        actorContext,
        currentUser: safeUser,
      })
      .catch(() => {});

    return safeUser;
  }

  async getUserById(idUsuario) {
    const user = await this.repository.getUserById(idUsuario);
    if (!user) {
      throw createHttpError(404, 'USER_NOT_FOUND', 'Usuario no encontrado');
    }

    return sanitizeUser(user);
  }

  async listUsers(query) {
    const result = await this.repository.listUsers(query);

    return {
      total: result.total,
      page: result.page,
      size: result.size,
      totalPages: Math.ceil(result.total / result.size) || 1,
      items: result.items.map(sanitizeUser),
    };
  }

  validateAdminSelfDisable(actorContext, targetUserId, nextEstado) {
    if (typeof nextEstado !== 'boolean') {
      return;
    }

    const isSelf = actorContext.userId && Number(actorContext.userId) === Number(targetUserId);
    if (isSelf && isAdminRole(actorContext.role) && nextEstado === false) {
      throw createHttpError(
        409,
        'ADMIN_SELF_DISABLE_FORBIDDEN',
        'Un administrador no puede deshabilitarse a si mismo'
      );
    }
  }

  async updateUser(idUsuario, patch, actorContext = {}) {
    const current = await this.repository.getUserById(idUsuario);
    if (!current) {
      throw createHttpError(404, 'USER_NOT_FOUND', 'Usuario no encontrado');
    }

    if (patch.correo) {
      const duplicated = await this.repository.getUserByCorreoExcludingId(patch.correo, idUsuario);
      if (duplicated) {
        throw createHttpError(409, 'USER_EMAIL_ALREADY_EXISTS', 'El correo ya esta registrado');
      }
    }

    this.validateAdminSelfDisable(actorContext, idUsuario, patch.estado);

    const patchToPersist = { ...patch };
    if (patch.contrasena) {
      patchToPersist.contrasena = await bcrypt.hash(patch.contrasena, this.bcryptSaltRounds);
    }

    const updated = await this.repository.updateUserPartial(idUsuario, patchToPersist);
    const safeCurrent = sanitizeUser(current);
    const safeUpdated = sanitizeUser(updated);

    void this.auditNotifier
      .notifyUserUpdated({
        actorContext,
        previousUser: safeCurrent,
        currentUser: safeUpdated,
      })
      .catch(() => {});

    return safeUpdated;
  }

  async deleteUser(idUsuario, actorContext = {}) {
    const current = await this.repository.getUserById(idUsuario);
    if (!current) {
      throw createHttpError(404, 'USER_NOT_FOUND', 'Usuario no encontrado');
    }

    this.validateAdminSelfDisable(actorContext, idUsuario, false);

    const updated = await this.repository.softDeleteUser(idUsuario);
    const safeCurrent = sanitizeUser(current);
    const safeUpdated = sanitizeUser(updated);

    void this.auditNotifier
      .notifyUserDisabled({
        actorContext,
        previousUser: safeCurrent,
        currentUser: safeUpdated,
      })
      .catch(() => {});

    return safeUpdated;
  }
}

module.exports = { UserService };
