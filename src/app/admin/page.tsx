'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { T, useT } from '@/i18n/provider';
import { Button } from '@/components/ui/button';

type Tab = 'overview' | 'workspaces' | 'plans' | 'audit' | 'billing';

export default function AdminPage() {
  const { t, locale } = useT();
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        tab === 'overview' ? '/api/admin/overview'
        : tab === 'workspaces' ? '/api/admin/workspaces'
        : tab === 'plans' ? '/api/admin/plans'
        : tab === 'audit' ? '/api/admin/audit'
        : '/api/admin/billing-events';
      const res = await fetch(url);
      if (res.status === 403) {
        setData(null);
        return;
      }
      setData(await res.json());
    } catch {
      toast.error(t('admin_page.001'));
    } finally {
      setLoading(false);
    }
  }, [tab, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function workspaceAction(accountId: string, action: 'suspend' | 'unsuspend') {
    const res = await fetch('/api/admin/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, action }),
    });
    if (res.ok) {
      toast.success(t('admin_page.002'));
      load();
    } else {
      toast.error(t('admin_page.003'));
    }
  }

  async function togglePlan(plan: { id: string; is_active: boolean }) {
    const res = await fetch('/api/admin/plans', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: plan.id, is_active: !plan.is_active }),
    });
    if (res.ok) {
      toast.success(t('admin_page.002'));
      load();
    } else {
      toast.error(t('admin_page.003'));
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: t('admin_page.004') },
    { id: 'workspaces', label: t('admin_page.005') },
    { id: 'plans', label: t('admin_page.006') },
    { id: 'audit', label: t('admin_page.007') },
    { id: 'billing', label: t('admin_page.008') },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-bold text-foreground"><T k="admin_page.009" /></h1>
      <div className="mt-6 flex gap-2 border-b border-border">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === tb.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground"><T k="admin_page.010" /></p>
        ) : tab === 'overview' ? (
          <Overview data={data} />
        ) : tab === 'workspaces' ? (
          <Workspaces data={data} onAction={workspaceAction} locale={locale} />
        ) : tab === 'plans' ? (
          <Plans data={data} onToggle={togglePlan} locale={locale} />
        ) : (
          <Events data={data} kind={tab} />
        )}
      </div>
    </div>
  );
}

function Overview({ data }: { data: Record<string, unknown> }) {
  const { t } = useT();
  const subs = (data.subscriptions ?? {}) as Record<string, number>;
  const cards: [string, number][] = [
    [t('admin_page.005'), (data.workspaces as number) ?? 0],
    [t('admin_page.011'), (data.users as number) ?? 0],
    [t('admin_page.006'), (data.plans as number) ?? 0],
    [t('admin_page.012'), (data.failed_billing_events as number) ?? 0],
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-bold text-foreground" dir="ltr">{value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground"><T k="admin_page.013" /></h3>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {Object.entries(subs).map(([status, count]) => (
            <span key={status} className="rounded-full bg-muted px-3 py-1 text-foreground">
              {status}: <b dir="ltr">{count}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

interface WorkspaceRow {
  id: string;
  name: string;
  created_at: string;
  subscription: { status: string; trial_ends_at: string | null; plan: { code: string } | null } | null;
  whatsapp_status: string;
}

function Workspaces({
  data,
  onAction,
  locale,
}: {
  data: Record<string, unknown>;
  onAction: (id: string, action: 'suspend' | 'unsuspend') => void;
  locale: string;
}) {
  const { t } = useT();
  const rows = (data.workspaces ?? []) as WorkspaceRow[];
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-start font-medium">{t('admin_page.014')}</th>
            <th className="px-4 py-2 text-start font-medium">{t('admin_page.015')}</th>
            <th className="px-4 py-2 text-start font-medium">{t('admin_page.016')}</th>
            <th className="px-4 py-2 text-start font-medium">WhatsApp</th>
            <th className="px-4 py-2 text-start font-medium">{t('admin_page.017')}</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id} className="border-t border-border">
              <td className="px-4 py-2 font-medium text-foreground">{w.name}</td>
              <td className="px-4 py-2" dir="ltr">{w.subscription?.plan?.code ?? '—'}</td>
              <td className="px-4 py-2">{w.subscription?.status ?? '—'}</td>
              <td className="px-4 py-2">{w.whatsapp_status}</td>
              <td className="px-4 py-2" dir="ltr">
                {new Date(w.created_at).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US')}
              </td>
              <td className="px-4 py-2">
                {w.subscription?.status === 'suspended' ? (
                  <Button size="sm" variant="outline" onClick={() => onAction(w.id, 'unsuspend')}>
                    {t('admin_page.018')}
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={() => onAction(w.id, 'suspend')}>
                    {t('admin_page.019')}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PlanRow {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  price_monthly: number;
  currency: string;
  is_active: boolean;
}

function Plans({
  data,
  onToggle,
  locale,
}: {
  data: Record<string, unknown>;
  onToggle: (p: PlanRow) => void;
  locale: string;
}) {
  const { t } = useT();
  const rows = (data.plans ?? []) as PlanRow[];
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground"><T k="admin_page.020" /></p>
      {rows.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <div className="font-medium text-foreground">
              {locale === 'ar' ? p.name_ar : p.name_en}{' '}
              <span className="text-xs text-muted-foreground" dir="ltr">({p.code})</span>
            </div>
            <div className="text-xs text-muted-foreground" dir="ltr">
              {p.price_monthly} {p.currency}/mo
            </div>
          </div>
          <Button size="sm" variant={p.is_active ? 'destructive' : 'default'} onClick={() => onToggle(p)}>
            {p.is_active ? t('admin_page.021') : t('admin_page.022')}
          </Button>
        </div>
      ))}
    </div>
  );
}

interface EventRow {
  id: string;
  action?: string;
  event_type?: string;
  provider?: string;
  status?: string;
  created_at: string;
}

function Events({ data, kind }: { data: Record<string, unknown>; kind: 'audit' | 'billing' }) {
  const rows = (data.events ?? []) as EventRow[];
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
      {rows.map((e) => (
        <div key={e.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2 text-sm">
          <span className="font-medium text-foreground" dir="ltr">
            {kind === 'audit' ? e.action : `${e.provider}:${e.event_type}`}
          </span>
          <span className="text-xs text-muted-foreground" dir="ltr">
            {e.status ? `${e.status} · ` : ''}
            {new Date(e.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
