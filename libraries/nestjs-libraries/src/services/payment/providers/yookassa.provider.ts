import { HttpException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import dayjs from 'dayjs';
import {
  PaymentInvoice,
  PaymentPlatform,
  PaymentProvider,
  PaymentProviderAbstract,
} from '@gitroom/nestjs-libraries/services/payment/payment.provider.interface';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { BillingSubscribeDto } from '@gitroom/nestjs-libraries/dtos/billing/billing.subscribe.dto';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { isYooKassaEnabled } from '@gitroom/helpers/utils/billing.enabled';

import { YOOKASSA_PROVIDER } from '@gitroom/nestjs-libraries/services/payment/payment.providers';

type Tier = 'STANDARD' | 'TEAM' | 'PRO' | 'ULTIMATE';
type Period = 'MONTHLY' | 'YEARLY';

interface YooKassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: { value: string; currency: string };
  created_at: string;
  description?: string;
  metadata?: Record<string, string>;
  payment_method?: { id: string; saved: boolean; type: string };
  confirmation?: { confirmation_url?: string };
}

const API = 'https://api.yookassa.ru/v3';
const RENEW_EVERY = 60 * 60 * 1000;
// a failed renewal keeps the plan for this many days before falling back to FREE
const GRACE_DAYS = 3;

// YooKassa (ЮKassa) - web payments in rubles for Russian deployments.
// Subscriptions are prepaid periods: every successful payment extends
// `paidUntil` by a month or a year. With YOOKASSA_AUTOPAY=true the card is
// saved and the next period is charged automatically (autopayments must be
// enabled for the shop by YooKassa). Payment state is always re-read from the
// API, webhook bodies are never trusted.
@PaymentProvider({ provider: YOOKASSA_PROVIDER })
export class YooKassaProvider
  extends PaymentProviderAbstract
  implements OnModuleInit, OnModuleDestroy
{
  platform: PaymentPlatform = 'web';
  private static timer: NodeJS.Timeout | null = null;
  // checkout id -> YooKassa payment id, lets the return page see a cancelled payment
  private static pending = new Map<string, string>();

  constructor(
    private _subscriptionService: SubscriptionService,
    private _usersService: UsersService
  ) {
    super();
  }

  onModuleInit() {
    if (
      !isYooKassaEnabled() ||
      process.env.YOOKASSA_RENEWALS === 'false' ||
      YooKassaProvider.timer
    ) {
      return;
    }
    YooKassaProvider.timer = setInterval(
      () => this.renewDue().catch((err) => console.error('yookassa_renew', err)),
      RENEW_EVERY
    );
  }

  onModuleDestroy() {
    if (YooKassaProvider.timer) {
      clearInterval(YooKassaProvider.timer);
      YooKassaProvider.timer = null;
    }
  }

  private autopay() {
    return process.env.YOOKASSA_AUTOPAY === 'true';
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: object,
    idempotenceKey?: string
  ): Promise<T> {
    if (!isYooKassaEnabled()) {
      throw new HttpException('YooKassa is not configured', 400);
    }

    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(
            `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`
          ).toString('base64'),
        'Content-Type': 'application/json',
        ...(idempotenceKey ? { 'Idempotence-Key': idempotenceKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('yookassa_error', response.status, data);
      throw new HttpException(
        `YooKassa request failed (${response.status}): ${
          data?.description || ''
        }`,
        response.status >= 500 ? 502 : 400
      );
    }
    return data as T;
  }

  private price(billing: Tier, period: Period) {
    const tier = pricing[billing];
    if (!tier || billing === ('FREE' as Tier)) {
      throw new HttpException('Unknown plan', 400);
    }
    return period === 'YEARLY' ? tier.year_price : tier.month_price;
  }

  private description(billing: Tier, period: Period) {
    const name = process.env.YOOKASSA_SERVICE_NAME || 'GravMix';
    return `${name}: тариф ${billing}, ${
      period === 'YEARLY' ? '12 месяцев' : '1 месяц'
    }`;
  }

  // 54-FZ receipt, only when the shop sends receipts through YooKassa
  private receipt(email: string, billing: Tier, period: Period) {
    if (process.env.YOOKASSA_RECEIPT !== 'true' || !email) {
      return {};
    }
    return {
      receipt: {
        customer: { email },
        items: [
          {
            description: this.description(billing, period).slice(0, 128),
            quantity: '1.00',
            amount: {
              value: this.price(billing, period).toFixed(2),
              currency: 'RUB',
            },
            vat_code: Number(process.env.YOOKASSA_VAT_CODE || 1),
            payment_mode: 'full_payment',
            payment_subject: 'service',
          },
        ],
      },
    };
  }

  private async createPayment(
    organizationId: string,
    userId: string,
    body: BillingSubscribeDto
  ) {
    const billing = body.billing as Tier;
    const period = body.period as Period;
    const checkoutId = makeId(10);
    const user = await this._usersService.getUserById(userId);

    const payment = await this.request<YooKassaPayment>(
      'POST',
      '/payments',
      {
        amount: {
          value: this.price(billing, period).toFixed(2),
          currency: 'RUB',
        },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: `${process.env.FRONTEND_URL}/launches?check=${checkoutId}`,
        },
        save_payment_method: this.autopay(),
        description: this.description(billing, period).slice(0, 128),
        metadata: {
          organizationId,
          billing,
          period,
          checkoutId,
        },
        ...this.receipt(user?.email || '', billing, period),
      },
      checkoutId
    );

    YooKassaProvider.pending.set(checkoutId, payment.id);
    return { url: payment.confirmation?.confirmation_url, id: checkoutId };
  }

  override async subscribe(
    uniqueId: string,
    organizationId: string,
    userId: string,
    body: BillingSubscribeDto
  ) {
    return this.createPayment(organizationId, userId, body);
  }

  override async embedded(
    uniqueId: string,
    organizationId: string,
    userId: string,
    body: BillingSubscribeDto
  ) {
    return this.createPayment(organizationId, userId, body);
  }

  // A new plan is a new prepaid period paid in full
  override async prorate(organizationId: string, body: BillingSubscribeDto) {
    return { price: this.price(body.billing as Tier, body.period as Period) };
  }

  validateWebhook(rawBody: Buffer) {
    const body = JSON.parse(rawBody.toString('utf8'));
    const id = body?.object?.id;
    if (body?.type !== 'notification' || typeof id !== 'string') {
      throw new HttpException('Invalid notification', 400);
    }
    return { event: body.event as string, id };
  }

  async processWebhook({ event, id }: { event: string; id: string }) {
    if (!event?.startsWith('payment.')) {
      return { ok: true };
    }
    const payment = await this.request<YooKassaPayment>(
      'GET',
      `/payments/${encodeURIComponent(id)}`
    );
    if (payment.status === 'succeeded' && payment.paid) {
      await this.applyPayment(payment);
    }
    return { ok: true };
  }

  // Extends the paid period once per payment (webhook and polling can both land)
  private async applyPayment(payment: YooKassaPayment) {
    const { organizationId, billing, period, checkoutId } =
      payment.metadata || {};
    if (!organizationId || !pricing[billing] || !checkoutId) {
      return;
    }

    const current = await this._subscriptionService.getSubscriptionByOrgId(
      organizationId
    );
    if (current?.lastPaymentId === payment.id) {
      return;
    }

    // renewal of the same plan continues from the end of the paid period
    const from =
      current &&
      !current.deletedAt &&
      current.provider === YOOKASSA_PROVIDER &&
      current.subscriptionTier === billing &&
      current.paidUntil &&
      dayjs(current.paidUntil).isAfter(dayjs())
        ? dayjs(current.paidUntil)
        : dayjs();
    const paidUntil = from.add(1, period === 'YEARLY' ? 'year' : 'month');

    const paymentMethodId =
      this.autopay() && payment.payment_method?.saved
        ? payment.payment_method.id
        : current?.paymentMethodId && this.autopay()
        ? current.paymentMethodId
        : null;

    await this._subscriptionService.createOrUpdateSubscriptionByOrg(
      false,
      organizationId,
      YOOKASSA_PROVIDER,
      checkoutId,
      pricing[billing].channel!,
      billing as Tier,
      period as Period,
      paymentMethodId ? null : paidUntil.unix()
    );

    const saved = await this._subscriptionService.getSubscriptionByOrgId(
      organizationId
    );
    if (saved?.provider !== YOOKASSA_PROVIDER || saved.deletedAt) {
      console.error('yookassa_payment_not_applied', organizationId, payment.id);
      return;
    }

    await this._subscriptionService.setPaidPeriod(organizationId, {
      paidUntil: paidUntil.toDate(),
      paymentMethodId,
      lastPaymentId: payment.id,
    });
  }

  // Charges saved cards for periods that ended, downgrades unpaid ones
  async renewDue() {
    const due = await this._subscriptionService.getDuePaidSubscriptions(
      YOOKASSA_PROVIDER,
      new Date()
    );

    for (const subscription of due) {
      const graceOver = dayjs(subscription.paidUntil).isBefore(
        dayjs().subtract(GRACE_DAYS, 'day')
      );

      if (
        !this.autopay() ||
        !subscription.paymentMethodId ||
        subscription.cancelAt ||
        graceOver
      ) {
        await this._subscriptionService.deleteSubscriptionByOrgId(
          subscription.organizationId,
          YOOKASSA_PROVIDER
        );
        continue;
      }

      try {
        const billing = subscription.subscriptionTier as Tier;
        const period = subscription.period as Period;
        const checkoutId = makeId(10);
        // one key per org and day: a restart or a second process never charges twice
        const payment = await this.request<YooKassaPayment>(
          'POST',
          '/payments',
          {
            amount: {
              value: this.price(billing, period).toFixed(2),
              currency: 'RUB',
            },
            capture: true,
            payment_method_id: subscription.paymentMethodId,
            description: this.description(billing, period).slice(0, 128),
            metadata: {
              organizationId: subscription.organizationId,
              billing,
              period,
              checkoutId,
              renewal: 'true',
            },
          },
          `renew-${subscription.organizationId}-${dayjs().format('YYYYMMDD')}`
        );
        if (payment.status === 'succeeded' && payment.paid) {
          await this.applyPayment(payment);
        }
      } catch (err) {
        console.error('yookassa_renew_failed', subscription.organizationId);
      }
    }
  }

  override async checkSubscription(organizationId: string, checkoutId: string) {
    const current = await this._subscriptionService.getSubscriptionByOrgId(
      organizationId
    );
    if (
      current &&
      !current.deletedAt &&
      current.provider === YOOKASSA_PROVIDER &&
      current.identifier === checkoutId
    ) {
      return 2;
    }

    const paymentId = YooKassaProvider.pending.get(checkoutId);
    if (!paymentId) {
      return 0;
    }
    const payment = await this.request<YooKassaPayment>(
      'GET',
      `/payments/${encodeURIComponent(paymentId)}`
    );
    if (payment.metadata?.organizationId !== organizationId) {
      return 1;
    }
    if (payment.status === 'canceled') {
      YooKassaProvider.pending.delete(checkoutId);
      return 1;
    }
    if (payment.status === 'succeeded' && payment.paid) {
      await this.applyPayment(payment);
      YooKassaProvider.pending.delete(checkoutId);
      return 2;
    }
    return 0;
  }

  // Cancel stops the autopayment, the plan stays until the paid period ends
  override async setToCancel(organizationId: string) {
    const current = await this._subscriptionService.getSubscriptionByOrgId(
      organizationId
    );
    if (!current || current.deletedAt || !current.paidUntil) {
      throw new HttpException('No active subscription found', 400);
    }

    const resume = !!current.cancelAt && !!current.paymentMethodId;
    const cancelAt = resume ? null : dayjs(current.paidUntil).unix();
    await this._subscriptionService.updateCancelAt(organizationId, cancelAt);

    return {
      id: makeId(10),
      cancel_at: cancelAt ? new Date(cancelAt * 1000) : undefined,
    };
  }

  override async cancelAllSubscriptions(organizationId: string) {
    await this._subscriptionService.deleteSubscriptionByOrgId(
      organizationId,
      YOOKASSA_PROVIDER
    );
  }

  override async cancelSubscription(organizationId: string) {
    return this.cancelAllSubscriptions(organizationId);
  }

  // YooKassa has no customer portal: the card is replaced by paying again
  override async portalLink() {
    return { url: `${process.env.FRONTEND_URL}/billing` };
  }

  override async getInvoices(): Promise<PaymentInvoice[]> {
    return [];
  }

  override async getRenewalDate(organizationId: string) {
    const current = await this._subscriptionService.getSubscriptionByOrgId(
      organizationId
    );
    return {
      renewsAt:
        current?.paidUntil && !current.deletedAt
          ? dayjs(current.paidUntil).unix()
          : null,
      trialing: false,
    };
  }

  override async getPackages() {
    return Object.entries(pricing)
      .filter(([key]) => key !== 'FREE')
      .map(([key, value]) => ({
        name: key,
        currency: 'RUB',
        month_price: value.month_price,
        year_price: value.year_price,
      }));
  }
}
