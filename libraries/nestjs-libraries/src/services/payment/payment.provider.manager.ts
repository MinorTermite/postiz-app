import { HttpException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  PaymentPlatform,
  PaymentProviderAbstract,
} from '@gitroom/nestjs-libraries/services/payment/payment.provider.interface';
import { webPaymentProvider } from '@gitroom/helpers/utils/billing.enabled';

@Injectable()
export class PaymentProviderManager {
  constructor(private _moduleRef: ModuleRef) {}

  private metadata(): { target: any; provider: string }[] {
    return (
      Reflect.getMetadata('payment-provider', PaymentProviderAbstract) || []
    );
  }

  getProvider(provider: string): PaymentProviderAbstract {
    const found = this.metadata().find((m) => m.provider === provider);

    if (!found) {
      throw new HttpException(`Payment provider ${provider} not found`, 400);
    }

    return this._moduleRef.get(found.target, { strict: false });
  }

  getProviders(): { name: string; provider: PaymentProviderAbstract }[] {
    return this.metadata().map((m) => ({
      name: m.provider,
      provider: this._moduleRef.get(m.target, { strict: false }),
    }));
  }

  // New web subscriptions use the configured web provider (PAYMENT_PROVIDER,
  // YooKassa when it has keys), otherwise the first registered one
  getDefaultProvider(platform: PaymentPlatform) {
    const providers = this.getProviders();
    const found =
      (platform === 'web' &&
        providers.find(
          (p) =>
            p.name === webPaymentProvider() && p.provider.platform === platform
        )) ||
      providers.find((p) => p.provider.platform === platform);

    if (!found) {
      throw new Error(`No payment provider registered for ${platform}`);
    }

    return found;
  }
}
