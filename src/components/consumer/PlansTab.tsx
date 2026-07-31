import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Check, X, Crown, Zap, Ban, Radar, Gift, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

export const PlansTab = () => {
  const { verifyCitizen, citizenVerified } = useApp();
  const { profile, upgradeToPremium } = useAuth();
  const { t } = useLanguage();
  const plan = profile?.membership_tier === 'premium' ? 'premium' : 'free';
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [citizenId, setCitizenId] = useState('');

  const handleVerify = async () => {
    if (citizenId.trim()) {
      verifyCitizen();
      await upgradeToPremium();
      toast({
        title: t('plans.verifySuccess'),
        description: t('plans.verifySuccessDesc'),
      });
    } else {
      toast({
        title: t('plans.verifyError'),
        description: t('plans.verifyErrorDesc'),
        variant: 'destructive',
      });
    }
  };

  const monthlyPrice = 3;
  const yearlyPrice = monthlyPrice * 12 * 0.8;
  const trialDays = 15;

  return (
    <div className="h-full overflow-y-auto pb-24">
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

        {/* Free Plan */}
        <div className={`glass-card p-5 animate-fade-in ${plan === 'free' && !citizenVerified ? 'ring-2 ring-primary' : ''}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">{t('plans.free')}</h3>
            <span className="text-2xl font-bold">€0</span>
          </div>

          <ul className="space-y-3 mb-5">
            <li className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-success" />
              <span>{t('plans.searchPerDay')}</span>
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
              <p className="text-xs text-success font-medium mt-0.5">{t('plans.trial', { n: trialDays })}</p>
            </div>
          </div>

          <ul className="space-y-3 mb-5">
            <li className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-accent" />
              <span className="font-medium">{t('plans.unlimited')}</span>
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
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={plan === 'premium'}
            onClick={() => upgradeToPremium()}
          >
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

          {citizenVerified ? (
            <div className="flex items-center gap-2 text-success bg-success/10 p-3 rounded-lg">
              <Check className="h-5 w-5" />
              <span className="font-medium">{t('plans.verified')}</span>
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                placeholder={t('plans.residentId')}
                value={citizenId}
                onChange={(e) => setCitizenId(e.target.value)}
                className="bg-background"
              />
              <Button
                onClick={handleVerify}
                className="w-full"
              >
                {t('plans.verify')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
