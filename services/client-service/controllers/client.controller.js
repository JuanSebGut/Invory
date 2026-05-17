const { AppError } = require('../errors');

function parsePositiveInt(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, 'VALIDACION_ERROR', `${fieldName} debe ser un numero entero positivo`);
  }
  return parsed;
}

function parseBooleanFlag(raw, fieldName) {
  if (typeof raw === 'boolean') {
    return raw;
  }

  if (raw === 'true' || raw === 'activo' || raw === '1') {
    return true;
  }

  if (raw === 'false' || raw === 'inactivo' || raw === '0') {
    return false;
  }

  throw new AppError(400, 'VALIDACION_ERROR', `${fieldName} debe ser booleano`);
}

class ClientController {
  constructor(repository) {
    this.repository = repository;
  }

  listClients = async (req, res, next) => {
    try {
      const page = req.query.page ? parsePositiveInt(req.query.page, 'page') : 1;
      const size = req.query.size ? parsePositiveInt(req.query.size, 'size') : 10;
      const estado = req.query.estado !== undefined ? parseBooleanFlag(req.query.estado, 'estado') : undefined;
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

      const data = await this.repository.listClients({ page, size, estado, q });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  getClientById = async (req, res, next) => {
    try {
      const idCliente = parsePositiveInt(req.params.id, 'id_cliente');
      const client = await this.repository.getClientById(idCliente);
      if (!client) {
        throw new AppError(404, 'CLIENTE_NO_ENCONTRADO', 'Cliente no encontrado');
      }
      res.status(200).json({ success: true, data: client });
    } catch (error) {
      next(error);
    }
  };

  createClient = async (req, res, next) => {
    try {
      const nombre = (req.body?.nombre || '').trim();
      if (!nombre) {
        throw new AppError(400, 'VALIDACION_ERROR', 'El nombre del cliente es obligatorio');
      }

      const created = await this.repository.createClient({
        nombre,
        telefono: req.body?.telefono || null,
        direccion: req.body?.direccion || null,
        correo: req.body?.correo || null,
        documento: req.body?.documento || null,
        estado: req.body?.estado === undefined ? true : parseBooleanFlag(req.body.estado, 'estado'),
      });

      res.status(201).json({ success: true, data: created });
    } catch (error) {
      next(error);
    }
  };

  updateClient = async (req, res, next) => {
    try {
      const idCliente = parsePositiveInt(req.params.id, 'id_cliente');
      const existing = await this.repository.getClientById(idCliente);
      if (!existing) {
        throw new AppError(404, 'CLIENTE_NO_ENCONTRADO', 'Cliente no encontrado');
      }

      const patch = {};
      const fields = ['nombre', 'telefono', 'direccion', 'correo', 'documento'];
      fields.forEach((field) => {
        if (req.body[field] !== undefined) {
          patch[field] = req.body[field];
        }
      });

      if (patch.nombre !== undefined) {
        patch.nombre = String(patch.nombre).trim();
        if (!patch.nombre) {
          throw new AppError(400, 'VALIDACION_ERROR', 'El nombre del cliente es obligatorio');
        }
      }

      const updated = await this.repository.updateClient(idCliente, patch);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  };

  patchClientStatus = async (req, res, next) => {
    try {
      const idCliente = parsePositiveInt(req.params.id, 'id_cliente');
      const estado = parseBooleanFlag(req.body?.estado, 'estado');
      const updated = await this.repository.patchClientStatus(idCliente, estado);
      if (!updated) {
        throw new AppError(404, 'CLIENTE_NO_ENCONTRADO', 'Cliente no encontrado');
      }
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  };

  listClientFiados = async (req, res, next) => {
    try {
      const idCliente = parsePositiveInt(req.params.id, 'id_cliente');
      const found = await this.repository.getClientById(idCliente);
      if (!found) {
        throw new AppError(404, 'CLIENTE_NO_ENCONTRADO', 'Cliente no encontrado');
      }
      const data = await this.repository.listFiadosByClient(idCliente);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  createClientFiado = async (req, res, next) => {
    try {
      const idCliente = parsePositiveInt(req.params.id, 'id_cliente');
      const idUsuario = parsePositiveInt(req.body?.id_usuario, 'id_usuario');
      const montoTotal = Number(req.body?.monto_total);
      const fechaPagoAcordada = req.body?.fecha_pago_acordada;

      if (!Number.isFinite(montoTotal) || montoTotal <= 0) {
        throw new AppError(400, 'VALIDACION_ERROR', 'monto_total debe ser mayor que cero');
      }

      if (!fechaPagoAcordada) {
        throw new AppError(400, 'VALIDACION_ERROR', 'fecha_pago_acordada es obligatoria');
      }

      const client = await this.repository.getClientById(idCliente);
      if (!client) {
        throw new AppError(404, 'CLIENTE_NO_ENCONTRADO', 'Cliente no encontrado');
      }

      const fiado = await this.repository.createFiado({
        id_cliente: idCliente,
        id_usuario: idUsuario,
        id_factura: req.body?.id_factura || null,
        monto_total: montoTotal,
        fecha_pago_acordada: fechaPagoAcordada,
        observaciones: req.body?.observaciones || null,
      });

      res.status(201).json({ success: true, data: fiado });
    } catch (error) {
      next(error);
    }
  };

  registerFiadoPayment = async (req, res, next) => {
    try {
      const idFiado = parsePositiveInt(req.params.id_fiado, 'id_fiado');
      const idUsuario = parsePositiveInt(req.body?.id_usuario, 'id_usuario');
      const monto = Number(req.body?.monto);

      if (!Number.isFinite(monto) || monto <= 0) {
        throw new AppError(400, 'VALIDACION_ERROR', 'monto debe ser mayor que cero');
      }

      const result = await this.repository.registerFiadoPayment({
        id_fiado: idFiado,
        id_usuario: idUsuario,
        monto,
        observaciones: req.body?.observaciones || null,
      });

      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  getFiadosAlerts = async (_req, res, next) => {
    try {
      const data = await this.repository.getFiadosAlerts();
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { ClientController };
