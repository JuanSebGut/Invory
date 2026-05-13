const { validateLoginPayload, extractBearerToken } = require('../models/auth.model');

class AuthController {
  constructor(authService) {
    this.authService = authService;
  }

  login = async (req, res, next) => {
    try {
      const payload = validateLoginPayload(req.body);
      const data = await this.authService.login(payload);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  logout = async (req, res, next) => {
    try {
      const token = extractBearerToken(req.headers.authorization);
      const data = await this.authService.logout(token);
      res.status(200).json({ success: true, message: data.message });
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req, res, next) => {
    try {
      const token = extractBearerToken(req.headers.authorization);
      const data = await this.authService.refresh(token);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  verify = async (req, res, next) => {
    try {
      const token = extractBearerToken(req.headers.authorization);
      const data = await this.authService.verify(token);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { AuthController };
