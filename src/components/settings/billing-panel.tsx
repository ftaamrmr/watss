'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CreditCard, Loader2 } from 'lucide-react';

import { useT } from '@/i18n/provider';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';

interface PlanRow {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  trial_days: number;
  limits: Record<string, number>;
  features: Record<string, boolean>;
  sort_order: number;
}

interface SubscriptionRow {
  id: string;
  status: string;
  billing_cycle: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export function formatMoney(
  amount: number,
  currency: string,
  locale: string,
): string {
  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function BillingPanel() {
  const { t, locale } = useT();
  const { accountRole } = useAuth();
  const isOwner = accountRole === 'owner';

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [subRes, plansRes] = await Promise.all([
        fetch('/api/billing/subscription'),
        fetch('/api/billing/plans'),
      ]);
      const subData = await subRes.json();
      const plansData = await plansRes.json();
      setSubscription(subData.subscription ?? null);
      setPlan(subData.plan ?? null);
      setPlans(plansData.plans ?? []);
    } catch {
      toast.error(t('settings_billing_panel.001'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function startCheckout(planId: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        toast.message(t('settings_billing_panel.002'));
        return;
      }
      if (!res.ok) throw new Error(data?.error);
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch {
      toast.error(t('settings_billing_panel.003'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelSubscription() {
    if (!window.confirm(t('settings_billing_panel.004'))) return;
    setBusy(true);
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' });
      if (!res.ok) throw new Error();
      toast.success(t('settings_billing_panel.005'));
      load();
    } catch {
      toast.error(t('settings_billing_panel.003'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const status = subscription?.status ?? 'none';
  const trialDaysLeft =
    status === 'trialing' && subscription?.trial_ends_at
      ? Math.max(
          0,
          Math.ceil(
            (new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86_400_000,
          ),
        )
      : 0;

  const planName = (p: PlanRow) => (locale === 'ar' ? p.name_ar : p.name_en);

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <CreditCard className="h-5 w-5 text-primary" />
          {t('settings_billing_panel.006')}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">{t('settings_billing_panel.007')}</div>
            <div className="mt-0.5 text-sm font-medium text-foreground">
              {plan ? planName(plan) : t('settings_billing_panel.008')}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('settings_billing_panel.009')}</div>
            <div className="mt-0.5 text-sm font-medium text-foreground">
              {t(`billing_status.${status}`)}
            </div>
          </div>
          {status === 'trialing' && (
            <div>
              <div className="text-xs text-muted-foreground">{t('settings_billing_panel.010')}</div>
              <div className="mt-0.5 text-sm font-medium text-foreground">
                {t('settings_billing_panel.011', { days: trialDaysLeft })}
              </div>
            </div>
          )}
          {subscription?.current_period_end && status !== 'trialing' && (
            <div>
              <div className="text-xs text-muted-foreground">{t('settings_billing_panel.012')}</div>
              <div className="mt-0.5 text-sm font-medium text-foreground" dir="ltr">
                {new Date(subscription.current_period_end).toLocaleDateString(
                  locale === 'ar' ? 'ar-SA' : 'en-US',
                )}
              </div>
            </div>
          )}
          {plan && (
            <div>
              <div className="text-xs text-muted-foreground">{t('settings_billing_panel.013')}</div>
              <div className="mt-0.5 text-sm font-medium text-foreground">
                {formatMoney(plan.price_monthly, plan.currency, locale)}{' '}
                {t('settings_billing_panel.014')}
              </div>
            </div>
          )}
        </div>

        {isOwner && subscription && status !== 'cancelled' && (
          <div className="mt-5">
            <Button variant="outline" onClick={cancelSubscription} disabled={busy}>
              {t('settings_billing_panel.015')}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('settings_billing_panel.016')}
            </p>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground">{t('settings_billing_panel.017')}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const current = plan?.id === p.id;
            return (
              <div
                key={p.id}
                className={`flex flex-col rounded-xl border p-5 ${
                  current ? 'border-primary bg-primary/5' : 'border-border bg-card'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-foreground">{planName(p)}</h3>
                  {current && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {t('settings_billing_panel.018')}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {locale === 'ar' ? p.description_ar : p.description_en}
                </p>
                <div className="mt-4">
                  <span className="text-2xl font-bold text-foreground">
                    {formatMoney(p.price_monthly, p.currency, locale)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {' '}
                    {t('settings_billing_panel.014')}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatMoney(p.price_yearly, p.currency, locale)}{' '}
                  {t('settings_billing_panel.019')}
                </div>
                {isOwner && (
                  <Button
                    className="mt-4"
                    variant={current ? 'outline' : 'default'}
                    disabled={busy || current}
                    onClick={() => startCheckout(p.id)}
                  >
                    {current
                      ? t('settings_billing_panel.018')
                      : plan && plans.indexOf(p) > plans.indexOf(plan)
                        ? t('settings_billing_panel.020')
                        : t('settings_billing_panel.021')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {!isOwner && (
          <p className="mt-3 text-xs text-muted-foreground">{t('settings_billing_panel.022')}</p>
        )}
      </section>
    </div>
  );
}
