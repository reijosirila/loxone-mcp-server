import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/Logger.js';

export function createAuthMiddleware(apiKey: string | undefined, logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip auth if no API key is configured
    if (!apiKey) {
      logger.debug('AuthMiddleware', 'No API key configured, allowing request');
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    
    // Check Bearer token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token === apiKey) {
        logger.debug('AuthMiddleware', 'Bearer token authentication successful');
        next();
        return;
      } else {
        logger.debug('AuthMiddleware', 'Bearer token mismatch');
      }
    }
    
    // Check X-API-Key header
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader === apiKey) {
      logger.debug('AuthMiddleware', 'X-API-Key authentication successful');
      next();
      return;
    }

    logger.warn('AuthMiddleware', `Unauthorized access attempt from ${req.ip}:`, {
      hasAuth: !!authHeader,
      hasApiKey: !!apiKeyHeader,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent']
    });

    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized',
      },
      id: null,
    });
  };
}