import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

interface NormalizedError {
  status: number;
  error: string;
  message: string;
  errors?: string[];
}

interface PgDriverError {
  code?: string;
  detail?: string;
  column?: string;
  constraint?: string;
}

const STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

/**
 * One consistent error envelope for the whole API:
 * `{ success: false, statusCode, error, message, errors?, path, timestamp }`.
 * Internal details (stack traces, SQL) are logged but never returned to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const normalized = this.normalize(exception);

    if (normalized.status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${normalized.status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(normalized.status).json({
      success: false,
      statusCode: normalized.status,
      error: normalized.error,
      message: normalized.message,
      ...(normalized.errors ? { errors: normalized.errors } : {}),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }
    if (exception instanceof QueryFailedError) {
      return this.fromQueryFailure(exception);
    }
    if (this.isMulterError(exception)) {
      return this.fromMulterError(exception);
    }
    if (this.isExpressHttpError(exception)) {
      return {
        status: exception.status,
        error: STATUS_NAMES[exception.status] ?? 'Error',
        message:
          exception.type === 'entity.too.large' ? 'The request body is too large.' : 'The request could not be processed.',
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: STATUS_NAMES[500],
      message: 'Something went wrong on the server. Please try again.',
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const error = STATUS_NAMES[status] ?? exception.name;

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return { status, error, message: 'Too many requests. Please wait a moment and try again.' };
    }

    if (typeof body === 'string') {
      return { status, error, message: body };
    }

    const payload = body as { message?: string | string[] };
    if (Array.isArray(payload.message)) {
      return { status, error, message: 'Validation failed', errors: payload.message };
    }
    return { status, error, message: payload.message ?? exception.message };
  }

  private fromQueryFailure(exception: QueryFailedError): NormalizedError {
    const driver = (exception.driverError ?? {}) as PgDriverError;

    switch (driver.code) {
      case '23505': {
        const field = this.fieldFromDetail(driver.detail);
        return {
          status: HttpStatus.CONFLICT,
          error: STATUS_NAMES[409],
          message: field ? `A record with this ${field} already exists.` : 'A record with the same value already exists.',
        };
      }
      case '23503': {
        const stillReferenced = driver.detail?.includes('is still referenced');
        return stillReferenced
          ? {
              status: HttpStatus.CONFLICT,
              error: STATUS_NAMES[409],
              message: 'This record is used by other records and cannot be removed. Deactivate it instead.',
            }
          : {
              status: HttpStatus.BAD_REQUEST,
              error: STATUS_NAMES[400],
              message: 'One of the referenced records does not exist.',
            };
      }
      case '22P02':
        return { status: HttpStatus.BAD_REQUEST, error: STATUS_NAMES[400], message: 'An identifier or value has an invalid format.' };
      case '23502':
        return { status: HttpStatus.BAD_REQUEST, error: STATUS_NAMES[400], message: 'A required value is missing.' };
      case '23514':
        return { status: HttpStatus.BAD_REQUEST, error: STATUS_NAMES[400], message: 'A value is outside the allowed range.' };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: STATUS_NAMES[500],
          message: 'A database error occurred. Please try again.',
        };
    }
  }

  /** "Key (student_id)=(ST-001) already exists." -> "student id" */
  private fieldFromDetail(detail?: string): string | null {
    const match = detail?.match(/Key \(([^)]+)\)=/);
    if (!match) return null;
    return match[1]
      .replace(/"/g, '')
      .split(',')
      .map((part) => part.trim().replace(/_/g, ' '))
      .join(' + ');
  }

  private isMulterError(exception: unknown): exception is { name: string; code: string } {
    return typeof exception === 'object' && exception !== null && (exception as { name?: string }).name === 'MulterError';
  }

  private fromMulterError(exception: { code: string }): NormalizedError {
    if (exception.code === 'LIMIT_FILE_SIZE') {
      return { status: HttpStatus.PAYLOAD_TOO_LARGE, error: STATUS_NAMES[413], message: 'The file is larger than the allowed upload size.' };
    }
    return { status: HttpStatus.BAD_REQUEST, error: STATUS_NAMES[400], message: 'The file upload was rejected.' };
  }

  private isExpressHttpError(exception: unknown): exception is { status: number; type?: string } {
    if (typeof exception !== 'object' || exception === null) return false;
    const status = (exception as { status?: unknown }).status;
    return typeof status === 'number' && status >= 400 && status < 500;
  }
}
