import { Injectable, LoggerService } from '@nestjs/common';
import { requestContext } from '../context/request-context';

type LogMeta = Record<string, unknown>;

@Injectable()
export class AppLoggerService implements LoggerService {
  private formatMessage(message: string, meta?: LogMeta) {
    const store = requestContext.getStore();
    const requestId = store?.requestId;

    return {
      requestId,
      message,
      ...(meta ?? {}),
    };
  }

  log(message: string, meta?: LogMeta) {
    console.log(JSON.stringify(this.formatMessage(message, meta)));
  }

  error(message: string, trace?: string, meta?: LogMeta) {
    console.error(
      JSON.stringify({
        ...this.formatMessage(message, meta),
        trace,
      }),
    );
  }

  warn(message: string, meta?: LogMeta) {
    console.warn(JSON.stringify(this.formatMessage(message, meta)));
  }

  debug(message: string, meta?: LogMeta) {
    console.debug(JSON.stringify(this.formatMessage(message, meta)));
  }

  verbose(message: string, meta?: LogMeta) {
    console.info(JSON.stringify(this.formatMessage(message, meta)));
  }
}
