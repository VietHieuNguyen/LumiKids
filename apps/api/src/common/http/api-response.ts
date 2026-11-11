import { Catch, HttpException, Injectable } from '@nestjs/common';
import type {
  ArgumentsHost,
  CallHandler,
  ExceptionFilter,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { map } from 'rxjs';
import { ApiProblem } from './api-problem.js';

const codes: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const detail =
      error instanceof HttpException ? error.getResponse() : undefined;
    let message = status >= 500 ? 'Internal server error.' : 'Request failed.';
    if (status < 500 && typeof detail === 'string') message = detail;
    if (
      status < 500 &&
      typeof detail === 'object' &&
      detail !== null &&
      'message' in detail &&
      typeof detail.message === 'string'
    )
      message = detail.message;
    response.status(status).json({
      success: false,
      code:
        error instanceof ApiProblem
          ? error.publicCode
          : (codes[status] ?? 'INTERNAL_SERVER_ERROR'),
      message: error instanceof ApiProblem ? error.publicMessage : message,
      data: null,
    });
  }
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<unknown>) {
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Cache-Control', 'no-store');
    return next.handle().pipe(
      map((data: unknown) => ({
        success: true,
        code: 'OK',
        message: 'Request successful.',
        data: data ?? null,
      })),
    );
  }
}
