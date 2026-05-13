const { Router } = require('express');

async function proxyToAuthService(req, res, authServiceUrl, endpoint, method) {
  const headers = { 'Content-Type': 'application/json' };
  if (req.headers.authorization) {
    headers.Authorization = req.headers.authorization;
  }

  const response = await fetch(`${authServiceUrl}${endpoint}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(req.body || {}),
  });

  const data = await response.json();
  return res.status(response.status).json(data);
}

function createAuthRoutes({ authServiceUrl }) {
  const router = Router();

  router.post('/login', (req, res, next) =>
    proxyToAuthService(req, res, authServiceUrl, '/api/auth/login', 'POST').catch(next)
  );

  router.post('/logout', (req, res, next) =>
    proxyToAuthService(req, res, authServiceUrl, '/api/auth/logout', 'POST').catch(next)
  );

  router.post('/refresh', (req, res, next) =>
    proxyToAuthService(req, res, authServiceUrl, '/api/auth/refresh', 'POST').catch(next)
  );

  router.get('/verify', (req, res, next) =>
    proxyToAuthService(req, res, authServiceUrl, '/api/auth/verify', 'GET').catch(next)
  );

  return router;
}

module.exports = { createAuthRoutes };
