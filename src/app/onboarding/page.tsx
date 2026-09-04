'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { T, useT, LOCALE_COOKIE, dirOf } from '@/i18n/provider';
import { Button } from '@/components/ui/button';

/**
 * Post-signup onboarding: workspace profile → language → trial/plan
 * status → WhatsApp → invite team (optional) → dashboard. Optional
 * steps are skippable.
 */
export default function OnboardingPage() {
  const { t, locale } = useT();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<{
    account: { name: string; country: string | null; timezone: string; preferred_language: string };
    whatsapp_status: string;
    member_count: number;
    entitlements: { status: string; trial_ends_at: string | null };
  } | null>(null);

  const [name, setName] = useState('');
  const [country, setCountry] = useState('SA');
  const [timezone, setTimezone] = useState('Asia/Riyadh');

  useEffect(() => {
    fetch('/api/account/onboarding')
      .then((r) => r.json())
      .then((d) => {
        setState(d);
        setName(d?.account?.name ?? '');
        setCountry(d?.account?.country ?? 'SA');
        setTimezone(d?.account?.timezone ?? 'Asia/Riyadh');
      })
      .catch(() => toast.error(t('onboarding_page.001')))
      .finally(() => setLoading(false));
  }, [t]);

  async function saveWorkspace() {
    setSaving(true);
    try {
      const res = await fetch('/api/account/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, country, timezone }),
      });
      if (!res.ok) throw new Error();
      setStep(1);
    } catch {
      toast.error(t('onboarding_page.002'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const steps = [
    t('onboarding_page.003'),
    t('onboarding_page.004'),
    t('onboarding_page.005'),
    t('onboarding_page.006'),
    t('onboarding_page.007'),
  ];

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-2">
          {steps.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1}
              </div>
              {i < steps.length - 1 && <div className="h-px w-6 bg-border" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          {step === 0 && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-foreground">{t('onboarding_page.008')}</h1>
              <p className="text-sm text-muted-foreground">{t('onboarding_page.009')}</p>
              <label className="block text-sm font-medium text-foreground">
                {t('onboarding_page.010')}
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                {t('onboarding_page.011')}
                <select
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="SA">{t('onboarding_page.012')}</option>
                  <option value="AE">{t('onboarding_page.013')}</option>
                  <option value="KW">{t('onboarding_page.014')}</option>
                  <option value="BH">{t('onboarding_page.015')}</option>
                  <option value="QA">{t('onboarding_page.016')}</option>
                  <option value="OM">{t('onboarding_page.017')}</option>
                  <option value="EG">{t('onboarding_page.018')}</option>
                  <option value="OTHER">{t('onboarding_page.019')}</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-foreground">
                {t('onboarding_page.020')}
                <select
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  dir="ltr"
                >
                  <option value="Asia/Riyadh">Asia/Riyadh</option>
                  <option value="Asia/Dubai">Asia/Dubai</option>
                  <option value="Asia/Kuwait">Asia/Kuwait</option>
                  <option value="Africa/Cairo">Africa/Cairo</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="UTC">UTC</option>
                </select>
              </label>
              <Button className="w-full" onClick={saveWorkspace} disabled={saving || !name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('onboarding_page.021')}
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-foreground">{t('onboarding_page.022')}</h1>
              <div className="grid grid-cols-2 gap-3">
                {(['ar', 'en'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => {
                      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
                      router.refresh();
                    }}
                    className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                      locale === l
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-foreground'
                    }`}
                  >
                    {l === 'ar' ? 'العربية' : 'English'}
                  </button>
                ))}
              </div>
              <Button className="w-full" onClick={() => setStep(2)}>
                {t('onboarding_page.021')}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-foreground">{t('onboarding_page.023')}</h1>
              {state?.entitlements?.status === 'trialing' ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
                  <CheckCircle2 className="mb-1 h-5 w-5 text-primary" />
                  {t('onboarding_page.024')}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('onboarding_page.025')}</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => router.push('/pricing')}>
                  {t('onboarding_page.026')}
                </Button>
                <Button className="flex-1" onClick={() => setStep(3)}>
                  {t('onboarding_page.021')}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-foreground">{t('onboarding_page.027')}</h1>
              <p className="text-sm text-muted-foreground">
                {state?.whatsapp_status === 'connected'
                  ? t('onboarding_page.028')
                  : t('onboarding_page.029')}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.push('/settings?tab=whatsapp')}
                >
                  {t('onboarding_page.030')}
                </Button>
                <Button className="flex-1" onClick={() => setStep(4)}>
                  {t('onboarding_page.031')}
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-foreground">{t('onboarding_page.032')}</h1>
              <p className="text-sm text-muted-foreground">{t('onboarding_page.033')}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.push('/settings?tab=members')}
                >
                  {t('onboarding_page.034')}
                </Button>
                <Button className="flex-1" onClick={() => router.push('/dashboard')}>
                  {t('onboarding_page.035')}
                </Button>
              </div>
            </div>
          )}
        </div>

        {step > 0 && step < 4 && (
          <button
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => router.push('/dashboard')}
          >
            <T k="onboarding_page.036" />
          </button>
        )}
      </div>
    </div>
  );
}
