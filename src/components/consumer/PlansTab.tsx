import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getMembershipStatus, FREE_DAILY_SEARCHES, PREMIUM_DAILY_SEARCHES } from '@/lib/membership';
import { Check, X, Crown, Zap, Ban, Radar, Gift, Star, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export const PlansTab = () => {
  const { profile, upgradeToPremium, redeemResidentCode } = useAuth();
  const { t } = useLanguage();
  // Single source of truth for tier -- see src/lib/membership.ts. Replaces
  // the old plain `profile?.membership_tier === 'premium'` check, which
  // couldn't tell an active trial from a resident grant from a trial that
  // expired but hasn't been synced back to 'free' yet.
  const status = getMembershipStatus(profile);
  const plan = status.kind === 'trial' || status.kind === 'resident' ? 'premium' : 'free';
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [citizenId, setCitizenId] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);
  // Whether this user's municipality has set a code at all. Only ever a
  // yes/no -- the code itself stays admin-only under RLS, since anyone who
  // could read it would have free Premium for the asking.
  const [codeConfigured, setCodeConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!profile?.municipality_id) return;
    supabase.rpc('has_resident_code').then(({ data, error }) => {
      if (error) {
        console.error('[PlansTab] has_resident_code failed:', error);
        return;
      }
      setCodeConfigured(Boolean(data));
    });
  }, [profile?.municipality_id]);

  const handleStartTrial = async () => {
    setStartingTrial(true);
    await upgradeToPremium();
    setStartingTrial(false);
  };

  const handleVerify = async () => {
    if (!citizenId.trim()) {
      toast({
        title: t('plans.verifyError'),
        description: t('plans.verifyErrorDesc'),
        variant: 'destructive',
      });
      return;
    }
    // redeem_resident_code matches against the caller's OWN municipality's
    // code, so an account with no municipality can only ever get back
    // "false" -- indistinguishable from a wrong code, and misleading: there
    // was nothing to be wrong about. Caught here so the message names the
    // actual problem.
    if (!profile?.municipality_id) {
      toast({ title: t('plans.verifyNoCity'), description: t('plans.verifyNoCityDesc'), variant: 'destructive' });
      return;
    }

    // "Double-check your code" is the wrong advice when the municipality
    // never set one: no code could have worked, and the resident has no way
    // to know that.
    if (codeConfigured === false) {
      toast({ title: t('plans.verifyNoCode'), description: t('plans.verifyNoCodeDesc'), variant: 'destructive' });
      return;
    }

    setVerifying(true);
    // Server-verified against the caller's own municipality's resident
    // code -- previously any non-empty string was accepted and silently
    // granted the same trial as the "Start Trial" button.
    const success = await redeemResidentCode(citizenId.trim());
    setVerifying(false);
    if (success) {
      toast({ title: t('plans.verifySuccess'), description: t('plans.verifySuccessDesc') });
    } else {
      toast({ title: t('plans.verifyInvalid'), description: t('plans.verifyInvalidDesc'), variant: 'destructive' });
    }
  };

  const monthlyPrice = 3;
  const yearlyPrice = monthlyPrice * 12 * 0.8;
  // Must match redeem_trial_premium()'s interval -- the server decides the
  // trial length, this only states it (see 0014_fourteen_day_trial.sql).
  const trialDays = 14;

  return (
    <div className="h-full overflow-y-auto overscroll-none pb-24">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 p-4 border-b border-border">
        <h1 className="text-2xl font-bold">{t('plans.title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('plans.subtitle')}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-2 bg-secondary rounded-full p-1">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-all ${
              billingCycle === 'monthly'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground'
            }`}
          >
            {t('plans.monthly')}
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-all ${
              billingCycle === 'yearly'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground'
            }`}
          >
            {t('plans.yearly')} <span className="text-success text-xs">-20%</span>
          </button>
        </div>

        {status.kind === 'expired' && (
          <div className="glass-card p-4 animate-fade-in bg-warning/10 border-warning/30 text-sm">
            {t('plans.trialExpired')}
          </div>
        )}

        {/* Free Plan */}
        <div className={`glass-card p-5 animate-fade-in ${status.kind === 'free' || status.kind === 'expired' ? 'ring-2 ring-primary' : ''}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">{t('plans.free')}</h3>
            <span className="text-2xl font-bold">€0</span>
          </div>

          <ul className="space-y-3 mb-5">
            <li className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-success" />
              <span>{t('plans.searchesPerDay', { n: FREE_DAILY_SEARCHES })}</span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-success" />
              <span>{t('plans.basicMap')}</span>
            </li>
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <X className="h-4 w-4" />
              <span>{t('plans.radar')}</span>
            </li>
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <X className="h-4 w-4" />
              <span>{t('plans.doublePoints')}</span>
            </li>
          </ul>

          <Button
            disabled
            variant="secondary"
            className="w-full"
          >
            {plan === 'free' ? t('plans.currentPlan') : t('plans.basic')}
          </Button>
        </div>

        {/* Premium Plan */}
        <div
          className={`glass-card p-5 animate-fade-in premium-border relative ${plan === 'premium' ? 'ring-2 ring-accent' : ''}`}
          style={{ animationDelay: '100ms' }}
          data-tour="plans-premium"
        >
          {/* Popular Badge */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="bg-accent text-accent-foreground text-xs font-bold px-3 py-1 rounded-full shadow-lg">
              {t('plans.popular')}
            </span>
          </div>

          <div className="flex items-center justify-between mb-4 mt-2">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-accent" />
              <h3 className="text-lg font-bold">{t('plans.premium')}</h3>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold">
                {billingCycle === 'monthly' ? `€${monthlyPrice}` : `€${yearlyPrice.toFixed(2)}`}
              </span>
              <span className="text-sm text-muted-foreground">
                /{billingCycle === 'monthly' ? t('plans.perMo') : t('plans.perYr')}
              </span>
              {status.kind === 'resident' ? (
                <p className="text-xs text-success font-medium mt-0.5">{t('plans.residentActive')}</p>
              ) : status.kind === 'trial' ? (
                <p className="text-xs text-success font-medium mt-0.5">
                  {Number.isFinite(status.daysLeft) ? t('plans.trialDaysLeft', { n: status.daysLeft }) : t('plans.active')}
                </p>
              ) : (
                <p className="text-xs text-success font-medium mt-0.5">{t('plans.trial', { n: trialDays })}</p>
              )}
            </div>
          </div>

          <ul className="space-y-3 mb-5">
            <li className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-accent" />
              <span className="font-medium">{t('plans.searchesPerDay', { n: PREMIUM_DAILY_SEARCHES })}</span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Radar className="h-4 w-4 text-accent" />
              <span>{t('plans.radar')}</span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Gift className="h-4 w-4 text-accent" />
              <span>{t('plans.doublePoints')}</span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <Ban className="h-4 w-4 text-accent" />
              <span>{t('plans.adFree')}</span>
            </li>
          </ul>

          <Button
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
            disabled={plan === 'premium' || startingTrial}
            onClick={handleStartTrial}
          >
            {startingTrial && <Loader2 className="h-4 w-4 animate-spin" />}
            {plan === 'premium' ? t('plans.active') : t('plans.startTrial', { n: trialDays })}
          </Button>
        </div>

        {/* Citizen Verification */}
        <div
          className="glass-card p-5 animate-fade-in bg-primary/5 border-primary/20"
          style={{ animationDelay: '200ms' }}
          data-tour="plans-resident"
        >
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-5 w-5 text-primary" />
            <h3 className="font-bold">{t('plans.residentTitle')}</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {t('plans.residentDesc')}
          </p>

          {status.kind === 'resident' ? (
            // Inline confirmation, not just a toast: a toast is gone in
            // seconds, and "did my code actually work?" is a question the
            // screen should still answer a minute later.
            <div className="flex items-start gap-3 text-success bg-success/10 border border-success/30 p-4 rounded-2xl animate-fade-in">
              <Check className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-sm">{t('plans.verified')}</p>
                <p className="text-xs text-success/90 mt-0.5">{t('plans.verifiedDesc')}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                placeholder={t('plans.residentIdPlaceholder')}
                value={citizenId}
                onChange={(e) => setCitizenId(e.target.value)}
                disabled={verifying}
                className="bg-background"
              />
              {codeConfigured === false && (
                <p className="text-xs text-warning">{t('plans.verifyNoCodeDesc')}</p>
              )}
              <Button
                onClick={handleVerify}
                disabled={verifying}
                className="w-full gap-2"
              >
                {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('plans.verify')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
