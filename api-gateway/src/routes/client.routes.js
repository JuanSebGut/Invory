'use strict';

const { Router } = require('express');

const { ADMINISTRADOR, EMPLEADO } = require('../../../shared/constants/roles');
const { requireRoles } = require('../middlewares/role.middleware');

function buildProxyUrl(baseUrl, path, query = {}) {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  return url;
}

async function sendProxyResponse(upstreamResponse, res) {
  const text = await upstreamResponse.text();
  const contentType = upstreamResponse.headers?.get?.('content-type') || 'application/json';

  res.status(upstreamResponse.status);

  if (contentType.includes('application/json')) {
    res.json(text ? JSON.parse(text) : {});
    return;
  }

  res.type(contentType).send(text);
}

async function proxyToClientService({ req, res, clientServiceUrl, path, method, fetchImpl }) {
  const headers = {
    'Content-Type': 'application/json',
    accept: 'application/json',
  };

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

  const upstreamUrl = buildProxyUrl(clientServiceUrl, path, req.query);
  const upstreamResponse = await fetchImpl(upstreamUrl, {
    method,
    headers,
    body: method === 'POST' || method === 'PUT' || method === 'PATCH' ? JSON.stringify(req.body || {}) : undefined,
  });

  await sendProxyResponse(upstreamResponse, res);
}

function createClientRoutes({ clientServiceUrl, authMiddleware, fetchImpl = fetch }) {
  const router = Router();

  // Empleado permitido solo en: GET /clients, GET /clients/:id, POST /clients/:id/fiados
  router.get(
    '/',
    authMiddleware,
    requireRoles([ADMINISTRADOR, EMPLEADO]),
    (req, res, next) =>
      proxyToClientService({
        req,
        res,
        clientServiceUrl,
        path: '/clients',
        method: 'GET',
        fetchImpl,
      }).catch(next)
  );

  router.get(
    '/:id',
    authMiddleware,
    requireRoles([ADMINISTRADOR, EMPLEADO]),
    (req, res, next) =>
      proxyToClientService({
        req,
        res,
        clientServiceUrl,
        path: `/clients/${req.params.id}`,
        method: 'GET',
        fetchImpl,
      }).catch(next)
  );

  router.post(
    '/:id/fiados',
    authMiddleware,
    requireRoles([ADMINISTRADOR, EMPLEADO]),
    (req, res, next) =>
      proxyToClientService({
        req,
        res,
        clientServiceUrl,
        path: `/clients/${req.params.id}/fiados`,
        method: 'POST',
        fetchImpl,
      }).catch(next)
  );

  // Solo administrador
  router.post(
    '/',
    authMiddleware,
    requireRoles([ADMINISTRADOR, EMPLEADO]),
    (req, res, next) =>
      proxyToClientService({
        req,
        res,
        clientServiceUrl,
        path: '/clients',
        method: 'POST',
        fetchImpl,
      }).catch(next)
  );

  router.put(
    '/:id',
    authMiddleware,
    requireRoles([ADMINISTRADOR, EMPLEADO]),
    (req, res, next) =>
      proxyToClientService({
        req,
        res,
        clientServiceUrl,
        path: `/clients/${req.params.id}`,
        method: 'PUT',
        fetchImpl,
      }).catch(next)
  );

  router.patch(
    '/:id/status',
    authMiddleware,
    requireRoles([ADMINISTRADOR, EMPLEADO]),
    (req, res, next) =>
      proxyToClientService({
        req,
        res,
        clientServiceUrl,
        path: `/clients/${req.params.id}/status`,
        method: 'PATCH',
        fetchImpl,
      }).catch(next)
  );

  router.get(
    '/:id/fiados',
    authMiddleware,
    requireRoles([ADMINISTRADOR, EMPLEADO]),
    (req, res, next) =>
      proxyToClientService({
        req,
        res,
        clientServiceUrl,
        path: `/clients/${req.params.id}/fiados`,
        method: 'GET',
        fetchImpl,
      }).catch(next)
  );

  return router;
}

function createFiadoRoutes({ clientServiceUrl, authMiddleware, fetchImpl = fetch }) {
  const router = Router();

  // Empleado permitido
  router.post(
    '/:id/pagos',
    authMiddleware,
    requireRoles([ADMINISTRADOR, EMPLEADO]),
    (req, res, next) =>
      proxyToClientService({
        req,
        res,
        clientServiceUrl,
        path: `/fiados/${req.params.id}/pagos`,
        method: 'POST',
        fetchImpl,
      }).catch(next)
  );

  // Solo administrador
  router.get(
    '/alertas',
    authMiddleware,
    requireRoles([ADMINISTRADOR, EMPLEADO]),
    (req, res, next) =>
      proxyToClientService({
        req,
        res,
        clientServiceUrl,
        path: '/fiados/alertas',
        method: 'GET',
        fetchImpl,
      }).catch(next)
  );

  return router;
}

module.exports = {
  buildProxyUrl,
  createClientRoutes,
  createFiadoRoutes,
  proxyToClientService,
  sendProxyResponse,
};
