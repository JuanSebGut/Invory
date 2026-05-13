const { created, ok } = require('../../../../shared/utils/response');
const {
  parseCategoryId,
  validateCreateCategoryPayload,
  validateUpdateCategoryPayload,
  validateCategoryFilter,
} = require('../models/category.model');

class CategoryController {
  constructor(categoryService) {
    this.categoryService = categoryService;
  }

  create = async (req, res, next) => {
    try {
      const payload = validateCreateCategoryPayload(req.body);
      await this.categoryService.createCategory(payload);
      return created(res, null, 'Categoria creada correctamente');
    } catch (error) {
      return next(error);
    }
  };

  list = async (req, res, next) => {
    try {
      const estado = validateCategoryFilter(req.query.estado);
      const categorias = await this.categoryService.listCategories({ estado });
      return ok(res, { categorias });
    } catch (error) {
      return next(error);
    }
  };

  update = async (req, res, next) => {
    try {
      const id = parseCategoryId(req.params.id);
      const payload = validateUpdateCategoryPayload(req.body);
      await this.categoryService.updateCategory(id, payload);
      return ok(res, null, 'Categoria actualizada correctamente');
    } catch (error) {
      return next(error);
    }
  };

  remove = async (req, res, next) => {
    try {
      const id = parseCategoryId(req.params.id);
      await this.categoryService.disableCategory(id);
      return ok(res, null, 'Categoria deshabilitada');
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { CategoryController };
