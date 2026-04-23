import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function convertBigInt(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as any).toNumber === 'function' &&
    typeof (value as any).toFixed === 'function'
  ) {
    return (value as any).toString();
  }
  if (Array.isArray(value)) return value.map((v) => convertBigInt(v, seen));
  if (value && typeof value === 'object') {
    if (seen.has(value as object)) return null;
    seen.add(value as object);
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = convertBigInt(v, seen);
    return out;
  }
  return value;
}

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => convertBigInt(data)));
  }
}
