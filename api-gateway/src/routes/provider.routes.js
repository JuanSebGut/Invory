const { Router } = require('express');

const { ADMINISTRADOR } = require('../../../shared/constants/roles');

function buildProxyUrl(baseUrl, path, query) {
  const searchParams = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.append(key, value);
    }
  });

  const queryString = searchParams.toString();
  return `${baseUrl}${path}${queryString ? `?${queryString}` : ''}`;
}

async function proxyToProviderService(req, res, providerServiceUrl, path, method, fetchImpl) {
  const headers = { 'Content-Type': 'application/json' };
  if (req.headers.authorization) {
    headers.Authorization = req.headers.authorization;
  }
  if (req.authUser?.id_usuario) {
    headers['x-user-id'] = String(req.authUser.id_usuario);
  }
  if (req.authUser?.rol) {
    headers['x-user-role'] = String(req.authUser.rol);
  }
  if (req.authUser?.nombre) {
    headers['x-user-name'] = String(req.authUser.nombre);
  }

  const response = await fetchImpl(buildProxyUrl(providerServiceUrl, path, req.query), {
    method,
    headers,
    body: method === 'POST' || method === 'PUT' ? JSON.stringify(req.body || {}) : undefined,
  });

  const data = await response.json();
  return res.status(response.status).json(data);
}

function requireAdmin(req, res, next) {
  if (req.authUser?.rol !== ADMINISTRADOR) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'AUTH_FORBIDDEN',
        message: 'No tiene permisos para esta operacion',
      },
    });
  }

  return next();
}

function createProviderRoutes({ providerServiceUrl, authMiddleware, fetchImpl = fetch }) {
  const router = Router();

  router.get('/', authMiddleware, requireAdmin, (req, res, next) =>
    proxyToProviderService(req, res, providerServiceUrl, '/api/providers', 'GET', fetchImpl).catch(
      next
    )
  );

  router.get('/:id', authMiddleware, requireAdmin, (req, res, next) =>
    proxyToProviderService(
      req,
      res,
      providerServiceUrl,
      `/api/providers/${req.params.id}`,
      'GET',
      fetchImpl
    ).catch(next)
  );

  router.post('/', authMiddleware, requireAdmin, (req, res, next) =>
    proxyToProviderService(req, res, providerServiceUrl, '/api/providers', 'POST', fetchImpl).catch(
      next
    )
  );

  router.put('/:id', authMiddleware, requireAdmin, (req, res, next) =>
    proxyToProviderService(
      req,
      res,
      providerServiceUrl,
      `/api/providers/${req.params.id}`,
      'PUT',
      fetchImpl
    ).catch(next)
  );

  router.delete('/:id', authMiddleware, requireAdmin, (req, res, next) =>
    proxyToProviderService(
      req,
      res,
      providerServiceUrl,
      `/api/providers/${req.params.id}`,
      'DELETE',
      fetchImpl
    ).catch(next)
  );

  return router;
}

module.exports = { createProviderRoutes };
