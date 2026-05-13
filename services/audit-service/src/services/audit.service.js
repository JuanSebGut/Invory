class AuditService {
  constructor({ repository }) {
    this.repository = repository;
  }

  async registerEvent(payload) {
    return this.repository.createAuditLog(payload);
  }

  async listLogs(filters) {
    const result = await this.repository.listLogs(filters);

    return {
      total: result.total,
      page: result.page,
      size: result.size,
      totalPages: Math.ceil(result.total / result.size) || 1,
      logs: result.items,
    };
  }
}

module.exports = { AuditService };
