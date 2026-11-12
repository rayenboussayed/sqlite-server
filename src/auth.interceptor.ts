import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { HEADER_AUTH_PASSWORD, HEADER_AUTH_USERNAME } from './constant.js';
import { environment } from './environment.js';

@Injectable()
export class AuthInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<any>) {
    if (!environment.AUTH_USERNAME && !environment.AUTH_PASSWORD)
      return next.handle();

    const request = context.switchToHttp().getRequest<FastifyRequest>();

    const username = request.headers[HEADER_AUTH_USERNAME];
    if (!username) throw new UnauthorizedException();

    const password = request.headers[HEADER_AUTH_PASSWORD];
    if (!password) throw new UnauthorizedException();

    if (
      username !== environment.AUTH_USERNAME ||
      password !== environment.AUTH_PASSWORD
    )
      throw new UnauthorizedException();

    return next.handle();
  }
}
