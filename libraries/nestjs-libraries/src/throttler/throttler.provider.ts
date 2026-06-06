import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  public override async canActivate(
    context: ExecutionContext
  ): Promise<boolean> {
    const { url, method } = context.switchToHttp().getRequest<Request>();

    const handler = context.getHandler();
    const classRef = context.getClass();
    const hasThrottleDecorator = this.throttlers.some(t =>
      this.reflector.getAllAndOverride(
        ('THROTTLER:LIMIT' as string) + t.name, [handler, classRef]
      ) !== undefined
    );

    if (hasThrottleDecorator) {
      return super.canActivate(context);
    }

    if (method === 'POST' && url.includes('/public/v1/posts')) {
      return super.canActivate(context);
    }

    return true;
  }

  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    return (
      req.org.id + '_' + (req.url.indexOf('/posts') > -1 ? 'posts' : 'other')
    );
  }
}
