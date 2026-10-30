import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Paginated } from '../pagination/pagination.util';

/**
 * Wraps every successful JSON response in `{ success: true, data, meta? }`.
 * File downloads (StreamableFile) pass through untouched.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        if (data instanceof StreamableFile) {
          return data;
        }
        if (data instanceof Paginated) {
          return { success: true, data: data.items, meta: data.meta };
        }
        return { success: true, data: data ?? null };
      }),
    );
  }
}
