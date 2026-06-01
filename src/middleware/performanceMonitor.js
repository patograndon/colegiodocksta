import { logger } from '../utils/logger.js';

export const performanceMonitor = (req, res, next) => {
  const start = Date.now();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const ms = Date.now() - start;
    res.setHeader('X-Response-Time', `${ms}ms`);
    if (ms > 100) {
      logger.warn('Respuesta lenta > 100ms', { method: req.method, url: req.url, ms, status: res.statusCode });
    }
    return originalJson(body);
  };

  next();
};
