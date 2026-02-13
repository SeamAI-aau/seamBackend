import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import { requestContext } from '../context/request-context';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept<T>(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<T> {
    const requestId = randomUUID();

    return requestContext.run({ requestId }, () => {
      return next.handle();
    });
  }
}
