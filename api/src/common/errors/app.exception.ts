import { HttpException } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export class AppException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    statusCode: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(
      {
        error: errorCode,
        message,
        details,
      },
      statusCode,
    );
  }
}
