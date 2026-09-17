import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Clock, Leaf } from 'lucide-react';

export const EcoDashboardCard: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{t('eco.title')}</p>
          <p className="text-xs text-muted-foreground">{t('eco.subtitle')}</p>
        </div>
        <span className="text-[10px] font-medium text-muted-foreground bg-secondary/60 px-2 py-1 rounded-full border border-border">
          {t('eco.comingSoon')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Time Saved */}
        <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex flex-col gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <p className="text-2xl font-bold tabular-nums leading-none">{t('eco.timeSavedValue')}</p>
          <p className="text-xs text-muted-foreground leading-snug">{t('eco.timeSaved')}</p>
        </div>

        {/* CO₂ Reduced */}
        <div className="bg-success/5 border border-success/10 rounded-2xl p-4 flex flex-col gap-2">
          <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center">
            <Leaf className="h-5 w-5 text-success" />
          </div>
          <p className="text-2xl font-bold tabular-nums leading-none">{t('eco.co2ReducedValue')}</p>
          <p className="text-xs text-muted-foreground leading-snug">{t('eco.co2Reduced')}</p>
        </div>
      </div>
    </div>
  );
};
