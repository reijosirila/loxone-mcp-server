import express, { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { Logger } from '../utils/Logger.js';

export function createJsonMiddleware(logger: Logger) {
  return express.json({
    limit: '10mb',
    verify: (_req, _res, buf) => {
      logger.debug('JsonMiddleware', `Received ${buf.length} bytes`);
    }
  });
}

export function createJsonErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: Error, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof SyntaxError && 'status' in error && error.status === 400 && 'body' in error) {
      logger.error('JsonMiddleware', 'Invalid JSON in request:', {
        error: error.message,
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent']
      });
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error: Invalid JSON'
        },
        id: null
      });
    }
    next();
  };
}