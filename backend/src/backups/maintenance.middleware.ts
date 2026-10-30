import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MaintenanceState } from './maintenance.state';

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private readonly state: MaintenanceState) {}

  use(request: Request, response: Response, next: NextFunction): void {
    if (!this.state.isRestoring) {
      next();
      return;
    }
    response
      .status(503)
      .set('Retry-After', '30')
      .json({
        success: false,
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'A backup is being restored. Please try again in a minute.',
        path: request.originalUrl,
        timestamp: new Date().toISOString(),
      });
  }
}
