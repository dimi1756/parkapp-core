import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getAllTiers, getBadgeForPoints, getNextTierInfo, estimateSpotsToNext } from '@/lib/badges';
import { Trophy, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface LeagueModalProps {
  points: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** League/progression breakdown -- opened from the user's rank badge. Shows
 *  every tier and exactly how far the account is from the next one. */
export const LeagueModal: React.FC<LeagueModalProps> = ({ points, open, onOpenChange }) => {
  const { t } = useLanguage();
  const currentBadge = getBadgeForPoints(points);
  const { nextTier, pointsToNext } = getNextTierInfo(points);
  const tiers = getAllTiers();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <Trophy className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center">{t('league.title')}</DialogTitle>
          <DialogDescription className="text-center">
            {nextTier
              ? t('league.pointsToNext', { n: pointsToNext, spots: estimateSpotsToNext(pointsToNext), tier: t(nextTier.labelKey) })
              : t('league.maxTier')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {tiers.map((tier) => {
            const reached = points >= tier.minPoints;
            const isCurrent = tier.tier === currentBadge.tier;
            return (
              <div
                key={tier.tier}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  isCurrent ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${tier.colorClass}`}>
                  {reached ? <Check className="h-4 w-4" /> : <X className="h-4 w-4 opacity-50" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{t(tier.labelKey)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('league.pointsRange', { n: tier.minPoints })}
                  </p>
                </div>
                {isCurrent && (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-primary text-primary-foreground shrink-0">
                    {t('league.youAreHere')}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* The board uses gold, silver and bronze twice over, for two
            unrelated things: a league is the points an account has earned in
            total and never goes down, while the podium ring is simply this
            week's top three. A Bronze driver can hold the gold ring, which
            looks like a bug until somebody says otherwise. */}
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 pt-3 border-t border-border/60">
          {t('league.vsPodium')}
        </p>
      </DialogContent>
    </Dialog>
  );
};
