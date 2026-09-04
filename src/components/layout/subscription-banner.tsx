'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { useT } from '@/i18n/provider';

/**
 * Slim banner above the app content reflecting subscription state:
 *   - trialing → days remaining (info)
 *   - past_due → payment warning (amber)
 *   - expired/suspended → upgrade CTA (red)
 * Reads /api/billing/subscription once per mount; renders nothing
 * while loading or when the subscription is healthy/active.
 */
export function SubscriptionBanner() {
  const { t } = useT();
  const [state, setState] = useState<{ status: string; daysLeft: number } | null>(null);

  useEffect(() => {
    fetch('/api/billing/subscription')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const s = d?.entitlements;
        if (!s) return;
        // Computed inside the effect (not render) so React Compiler
        // purity rules are respected.
        const daysLeft = s.trial_ends_at
          ? Math.max(0, Math.ceil((new Date(s.trial_ends_at).getTime() - Date.now()) / 86_400_000))
          : 0;
        setState({ status: s.status, daysLeft });
      })
      .catch(() => {});
  }, []);

  if (!state) return null;

  if (state.status === 'trialing') {
    if (state.daysLeft > 3) return null; // only nudge near the end
    return (
      <Banner tone="info">
        {t('layout_subscription_banner.001', { days: state.daysLeft })}{' '}
        <Link href="/settings?tab=billing" className="font-medium underline">
          {t('layout_subscription_banner.002')}
        </Link>
      </Banner>
    );
  }

  if (state.status === 'past_due') {
    return <Banner tone="warn">{t('layout_subscription_banner.003')}</Banner>;
  }

  if (state.status === 'expired' || state.status === 'suspended' || state.status === 'none') {
    return (
      <Banner tone="danger">
        {t('layout_subscription_banner.004')}{' '}
        <Link href="/settings?tab=billing" className="font-medium underline">
          {t('layout_subscription_banner.005')}
        </Link>
      </Banner>
    );
  }

  return null;
}

function Banner({
  tone,
  children,
}: {
  tone: 'info' | 'warn' | 'danger';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'danger'
      ? 'border-destructive/40 bg-destructive/10 text-destructive'
      : tone === 'warn'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
        : 'border-primary/30 bg-primary/5 text-foreground';
  return (
    <div className={`border-b px-4 py-2 text-center text-sm ${cls}`}>{children}</div>
  );
}
