const {
  ConflictError,
  NotFoundError,
} = require('../../../../shared/middlewares/errorHandler');
const { mapCategoryRow } = require('../models/category.model');

class CategoryService {
  constructor({ repository }) {
    this.repository = repository;
  }

  async createCategory(payload) {
    await this.ensureUniqueName(payload.nombre_categoria);

    const category = await this.repository.createCategory({
      ...payload,
      estado: true,
    });

    return mapCategoryRow(category);
  }

  async listCategories({ estado }) {
    const categories = await this.repository.listCategories(estado);
    return categories.map(mapCategoryRow);
  }

  async updateCategory(id, updates) {
    const currentCategory = await this.repository.getCategoryById(id);
    if (!currentCategory) {
      throw new NotFoundError('Categoria no encontrada');
    }

    if (updates.nombre_categoria !== undefined) {
      await this.ensureUniqueName(updates.nombre_categoria, id);
    }

    const nextCategory = {
      nombre_categoria: updates.nombre_categoria ?? currentCategory.nombre_categoria,
      descripcion:
        updates.descripcion !== undefined ? updates.descripcion : currentCategory.descripcion,
      estado: updates.estado ?? currentCategory.estado,
    };

    if (currentCategory.estado && nextCategory.estado === false) {
      await this.ensureCategoryCanBeDisabled(id);
    }

    const updated = await this.repository.updateCategory(id, nextCategory);
    return mapCategoryRow(updated);
  }

  async disableCategory(id) {
    const currentCategory = await this.repository.getCategoryById(id);
    if (!currentCategory) {
      throw new NotFoundError('Categoria no encontrada');
    }

    if (currentCategory.estado) {
      await this.ensureCategoryCanBeDisabled(id);
      await this.repository.updateCategory(id, {
        nombre_categoria: currentCategory.nombre_categoria,
        descripcion: currentCategory.descripcion,
        estado: false,
      });
    }
  }

  async ensureUniqueName(nombreCategoria, excludeId = null) {
    const existing = await this.repository.findByNameInsensitive(nombreCategoria, excludeId);
    if (existing) {
      throw new ConflictError('El nombre de categoria ya existe');
    }
  }

  async ensureCategoryCanBeDisabled(id) {
    const activeProducts = await this.repository.countActiveProductsByCategoryId(id);
    if (activeProducts > 0) {
      throw new ConflictError(
        'No se puede deshabilitar: hay productos activos en esta categoria'
      );
    }
  }
}

module.exports = { CategoryService };
