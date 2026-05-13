class InventoryNotifier {
  constructor({ ms06MovementWebhookUrl, ms09MovementWebhookUrl, fetchImpl = fetch } = {}) {
    this.ms06MovementWebhookUrl = ms06MovementWebhookUrl;
    this.ms09MovementWebhookUrl = ms09MovementWebhookUrl;
    this.fetchImpl = fetchImpl;
  }

  async post(url, payload) {
    if (!url) {
      return;
    }

    await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  buildAuditPayload(movement) {
    const isAdjustment = movement.movement_type === 'ajuste' || movement.tipo_movimiento === 'ajuste';
    return {
      action: isAdjustment ? 'registrar_ajuste' : 'registrar_movimiento',
      module: 'inventario',
      entity: 'movimiento_inventario',
      entityId: movement.id_movimiento,
      user: movement.id_usuario
        ? {
            id_usuario: movement.id_usuario,
            nombre: movement.nombre_usuario || movement.usuario_nombre,
            rol: movement.rol_usuario || null,
          }
        : undefined,
      detail: {
        tipo_movimiento: movement.movement_type || movement.tipo_movimiento,
        tipo_ajuste: movement.tipo_ajuste || null,
        motivo: movement.nombre_motivo || movement.motivo_ajuste || movement.motivo || null,
        cantidad: Number(movement.cantidad),
        id_producto: movement.id_producto,
        numero_factura: movement.numero_factura || null,
        comentario: movement.comentarios || movement.comentario || null,
      },
      previousData: {
        stock_actual: Number(movement.stock_anterior),
      },
      newData: {
        stock_actual: Number(movement.stock_posterior),
      },
    };
  }

  async notifyMovementRegistered(movement) {
    const movementEvent = {
      event: 'inventory.movement.created',
      data: movement,
    };

    await Promise.allSettled([
      this.post(this.ms06MovementWebhookUrl, movementEvent),
      this.post(this.ms09MovementWebhookUrl, this.buildAuditPayload(movement)),
    ]);
  }
}

module.exports = { InventoryNotifier };
