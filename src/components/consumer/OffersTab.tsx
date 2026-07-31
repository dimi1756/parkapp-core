import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { StringKey } from '@/i18n/strings';
import { supabase } from '@/integrations/supabase/client';
import { Gift, Coffee, ShoppingBag, Popcorn, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface Offer {
  id: string;
  business: string;
  rewardKey: StringKey;
  cost: number;
  icon: React.ReactNode;
  color: string;
}

const offers: Offer[] = [
  {
    id: '1',
    business: 'Mikel Coffee',
    rewardKey: 'offers.reward.coffee',
    cost: 300,
    icon: <Coffee className="h-6 w-6" />,
    color: 'from-amber-600 to-amber-700',
  },
  {
    id: '2',
    business: 'Sklavenitis',
    rewardKey: 'offers.reward.coupon',
    cost: 500,
    icon: <ShoppingBag className="h-6 w-6" />,
    color: 'from-red-500 to-red-600',
  },
  {
    id: '3',
    business: 'Cinema Chalkida',
    rewardKey: 'offers.reward.popcorn',
    cost: 200,
    icon: <Popcorn className="h-6 w-6" />,
    color: 'from-purple-500 to-purple-600',
  },
  {
    id: '4',
    business: 'Shell',
    rewardKey: 'offers.reward.fuel',
    cost: 400,
    icon: <Gift className="h-6 w-6" />,
    color: 'from-yellow-500 to-yellow-600',
  },
];

export const OffersTab = () => {
  const { session, profile } = useAuth();
  const { t } = useLanguage();
  const points = profile?.points_balance ?? 0;

  const handleRedeem = async (offer: Offer) => {
    if (!session?.user) return;

    if (points < offer.cost) {
      toast({
        title: t('offers.insufficient'),
        description: t('offers.insufficientDesc', { n: offer.cost - points }),
        variant: 'destructive',
      });
      return;
    }

    // Spending is the one ledger write a client may make directly -- RLS
    // only allows negative deltas, so this can never award points, only
    // deduct the user's own (see supabase/migrations/0004_anti_spam_support.sql).
    const { error } = await supabase.from('points_transactions').insert({
      user_id: session.user.id,
      delta: -offer.cost,
      reason: `redeemed_${offer.business.toLowerCase().replace(/\s+/g, '_')}`,
    });

    if (error) {
      toast({ title: t('offers.redeemFailed'), description: error.message, variant: 'destructive' });
      return;
    }

    toast({
      title: t('offers.successTitle'),
      description: t('offers.successDesc', { reward: t(offer.rewardKey), business: offer.business }),
    });
  };

  return (
    <div className="h-full overflow-y-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 p-4 border-b border-border" data-tour="offers-balance">
        <h1 className="text-2xl font-bold">{t('offers.title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('offers.available')} <span className="font-semibold text-primary">{points}</span>
        </p>
      </div>

      {/* Offers List */}
      <div className="p-4 space-y-4">
        {offers.map((offer, index) => (
          <div
            key={offer.id}
            className="glass-card p-4 animate-fade-in"
            style={{ animationDelay: `${index * 100}ms` }}
            {...(index === 0 ? { 'data-tour': 'offers-list' } : {})}
          >
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${offer.color} flex items-center justify-center text-white shadow-lg`}>
                {offer.icon}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">{offer.business}</h3>
                <p className="text-sm text-muted-foreground">{t(offer.rewardKey)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                    💎 {offer.cost} {t('offers.points')}
                  </span>
                  {points >= offer.cost && (
                    <span className="text-xs text-success flex items-center gap-1">
                      <Check className="h-3 w-3" /> {t('offers.availableTag')}
                    </span>
                  )}
                </div>
              </div>

              <Button
                onClick={() => handleRedeem(offer)}
                disabled={points < offer.cost}
                size="sm"
                className={points >= offer.cost
                  ? 'bg-primary hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground'
                }
              >
                {t('offers.redeem')}
              </Button>
            </div>
          </div>
        ))}

        {/* Info Card */}
        <div className="glass-card p-4 mt-6 bg-primary/5 border-primary/20">
          <div className="flex items-start gap-3">
            <Gift className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h4 className="font-medium text-sm">{t('offers.howEarnTitle')}</h4>
              <p className="text-xs text-muted-foreground mt-1">
                {t('offers.howEarnDesc')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
