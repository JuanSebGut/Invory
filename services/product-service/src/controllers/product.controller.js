const {
  validateCreateProductPayload,
  validateUpdateProductPayload,
  parseListQuery,
  parseProductId,
} = require('../models/product.model');

function sendSuccess(res, status, payload) {
  const body = {
    success: true,
    data: payload.data ?? payload,
  };

  if (payload?.warning) {
    body.warning = payload.warning;
  }

  res.status(status).json(body);
}

class ProductController {
  constructor(productService) {
    this.productService = productService;
  }

  createProduct = async (req, res, next) => {
    try {
      const payload = validateCreateProductPayload(req.body);
      const result = await this.productService.createProduct(payload);
      sendSuccess(res, 201, result);
    } catch (error) {
      next(error);
    }
  };

  getProductById = async (req, res, next) => {
    try {
      const idProducto = parseProductId(req.params.id);
      const result = await this.productService.getProductById(idProducto);
      sendSuccess(res, 200, result);
    } catch (error) {
      next(error);
    }
  };

  listProducts = async (req, res, next) => {
    try {
      const query = parseListQuery(req.query);
      const result = await this.productService.listProducts(query);
      sendSuccess(res, 200, result);
    } catch (error) {
      next(error);
    }
  };

  updateProduct = async (req, res, next) => {
    try {
      const idProducto = parseProductId(req.params.id);
      const patch = validateUpdateProductPayload(req.body);
      const result = await this.productService.updateProduct(idProducto, patch);
      sendSuccess(res, 200, result);
    } catch (error) {
      next(error);
    }
  };

  deleteProduct = async (req, res, next) => {
    try {
      const idProducto = parseProductId(req.params.id);
      const result = await this.productService.deleteProduct(idProducto);
      sendSuccess(res, 200, result);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { ProductController };
