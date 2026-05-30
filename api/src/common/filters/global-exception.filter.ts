import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

type StructuredHttpError = {
  message?: string | string[];
  code?: string;
  error?: string;
  details?: Record<string, unknown>;
};

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code: string | undefined;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (exceptionResponse && typeof exceptionResponse === 'object') {
        const body = exceptionResponse as StructuredHttpError;
        const msg = body.message;
        message = Array.isArray(msg) ? msg.join('; ') : (msg ?? exception.message);
        code = body.code ?? (typeof body.error === 'string' ? body.error : undefined);
        details = body.details;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errForLog =
      exception instanceof Error
        ? exception
        : new Error(typeof exception === 'string' ? exception : JSON.stringify(exception));

    if (status >= 500) {
      this.logger.error(
        {
          err: errForLog,
          errName: errForLog.name,
          errMessage: errForLog.message,
          errStack: errForLog.stack,
          path: request.url,
          method: request.method,
        },
        `Unhandled exception: ${message}`,
      );
    } else {
      this.logger.warn(
        { err: errForLog, path: request.url, method: request.method },
        `Client error: ${message}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(code ? { code } : {}),
      ...(details ? { details } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
