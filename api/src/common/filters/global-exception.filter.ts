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

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else if (response && typeof response === 'object' && 'message' in response) {
        const msg = (response as { message?: string | string[] }).message;
        message = Array.isArray(msg) ? msg.join('; ') : (msg ?? exception.message);
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
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
