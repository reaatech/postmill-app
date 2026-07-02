import {
  Controller,
  HttpException,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { StripeService } from '@gitroom/nestjs-libraries/services/stripe.service';
import { StripeEventRepository } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/stripe-event.repository';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Stripe')
@Controller('/stripe')
export class StripeController {
  constructor(
    private readonly _stripeService: StripeService,
    private readonly _stripeEventRepository: StripeEventRepository,
  ) {}

  @Post('/')
  async stripe(@Req() req: RawBodyRequest<Request>) {
    const event = this._stripeService.validateRequest(
      req.rawBody,
      // @ts-ignore
      req.headers['stripe-signature'],
      process.env.STRIPE_SIGNING_KEY
    );

    // Maybe it comes from another stripe webhook
    if (
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      event?.data?.object?.metadata?.service !== 'gitroom' &&
      event.type !== 'invoice.payment_succeeded' &&
      event.type !== 'invoice.payment_failed'
    ) {
      return { ok: true };
    }

    // Idempotency (C1): Stripe redelivers events; ignore an event.id we've already
    // processed so a redelivered subscription mutation can't re-run the transition.
    if (await this._stripeEventRepository.exists(event.id)) {
      return { ok: true };
    }

    try {
      let result: any;
      switch (event.type) {
        case 'invoice.payment_succeeded':
          result = await this._stripeService.paymentSucceeded(event);
          break;
        case 'invoice.payment_failed':
          result = await this._stripeService.paymentFailed(event);
          break;
        case 'customer.subscription.created':
          result = await this._stripeService.createSubscription(event);
          break;
        case 'customer.subscription.updated':
          result = await this._stripeService.updateSubscription(event);
          break;
        case 'customer.subscription.deleted':
          result = await this._stripeService.deleteSubscription(event);
          break;
        default:
          result = { ok: true };
      }

      // Record only after successful processing so a thrown error stays retryable.
      await this._stripeEventRepository.record(event.id, event.type);
      return result;
    } catch (e) {
      throw new HttpException(e, 500);
    }
  }
}
