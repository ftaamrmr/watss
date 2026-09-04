'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { useT } from '@/i18n/provider';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';

interface UsageRow {
  metric: string;
  used: number;
}

const METERED: { metric: string; limitKey: string; labelKey: string }[] = [
  { metric: 'messages', limitKey: 'monthly_messages', labelKey: 'settings_usage_panel.001' },
  { metric: 'ai_requests', limitKey: 'ai_requests_per_month', labelKey: 'settings_usage_panel.002' },
  { metric: 'api_requests', limitKey: 'api_requests_per_month', labelKey: 'settings_usage_panel.003' },
  { metric: 'broadcasts', limitKey: 'broadcasts_per_month', labelKey: 'settings_usage_panel.004' },
];

export function UsagePanel() {
  const { t, locale } = useT();
  const { accountId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/billing/subscription');
        const data = await res.json();
        setLimits(data?.entitlements?.limits ?? {});
        setUsage(data?.usage ?? []);

        // Count-based resources: live counts straight from the DB.
        if (accountId) {
          const supabase = createClient();
          const [members, contacts, wa, automations] = await Promise.all([
            supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('account_id', accountId),
            supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
            supabase.from('whatsapp_config').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
            supabase.from('automations').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
          ]);
          setCounts({
            team_members: members.count ?? 0,
            contacts: contacts.count ?? 0,
            whatsapp_accounts: wa.count ?? 0,
            automations: automations.count ?? 0,
          });
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [accountId]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const fmt = (n: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(n);

  const rows = [
    ...METERED.map((m) => ({
      label: t(m.labelKey),
      used: usage.find((u) => u.metric === m.metric)?.used ?? 0,
      limit: limits[m.limitKey] ?? -1,
    })),
    { label: t('settings_usage_panel.005'), used: counts.contacts ?? 0, limit: limits.contacts ?? -1 },
    { label: t('settings_usage_panel.006'), used: counts.team_members ?? 0, limit: limits.team_members ?? -1 },
    { label: t('settings_usage_panel.007'), used: counts.whatsapp_accounts ?? 0, limit: limits.whatsapp_accounts ?? -1 },
    { label: t('settings_usage_panel.008'), used: counts.automations ?? 0, limit: limits.automations ?? -1 },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('settings_usage_panel.009')}</p>
      {rows.map((r) => {
        const unlimited = r.limit < 0;
        const pct = unlimited ? 0 : Math.min(100, Math.round((r.used / Math.max(1, r.limit)) * 100));
        const danger = !unlimited && pct >= 90;
        return (
          <div key={r.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{r.label}</span>
              <span className="tabular-nums text-muted-foreground" dir="ltr">
                {fmt(r.used)} / {unlimited ? '∞' : fmt(r.limit)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${danger ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${unlimited ? 4 : Math.max(2, pct)}%` }}
              />
            </div>
            {danger && (
              <p className="mt-2 text-xs text-destructive">{t('settings_usage_panel.010')}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
