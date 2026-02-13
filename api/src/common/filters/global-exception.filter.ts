import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { requestContext } from '../context/request-context';
import { ErrorCode } from '../errors/error-codes';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const store = requestContext.getStore();
    const requestId = store?.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const responseBody = res as {
          error?: ErrorCode;
          message?: string;
          details?: unknown;
        };

        error = responseBody.error ?? error;
        message = responseBody.message ?? message;
        details = responseBody.details;
      } else {
        message = res;
      }
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      details,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }
}
