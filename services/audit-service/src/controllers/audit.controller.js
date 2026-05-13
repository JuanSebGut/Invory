const { parseAuditEventPayload, parseLogFilters } = require('../models/audit.model');

class AuditController {
  constructor(auditService) {
    this.auditService = auditService;
  }

  registerEvent = async (req, res, next) => {
    try {
      const payload = parseAuditEventPayload(req.body);
      const data = await this.auditService.registerEvent(payload);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  listLogs = async (req, res, next) => {
    try {
      const filters = parseLogFilters(req.query);
      const data = await this.auditService.listLogs(filters);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { AuditController };
