import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Trophy, Crown, Sparkles } from 'lucide-react';

// Gamification placeholder: real rankings need a leaderboard RPC/view over
// profiles.points_balance we haven't built yet. This mock top-3 exists to
// show investors the intended shape of the feature, not live data.
const MOCK_TOP_3 = [
  { initials: 'ΝΠ', name: 'Nikos P.', points: 2840 },
  { initials: 'ΕΚ', name: 'Eleni K.', points: 2615 },
  { initials: 'ΔΜ', name: 'Dimitris M.', points: 2390 },
];

const RANK_BADGE_COLOR = ['bg-accent', 'bg-slate-400', 'bg-amber-700'];

export const LeaderboardTab = () => {
  const { t, locale } = useLanguage();

  return (
    <div className="h-full overflow-y-auto pb-24">
      <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6 pb-10 text-center">
        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
          <Trophy className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold">{t('leaderboard.title')}</h1>
        <span className="inline-block mt-2 bg-white/20 text-xs font-semibold px-3 py-1 rounded-full">
          {t('leaderboard.comingSoon')}
        </span>
      </div>

      <div className="p-4 -mt-6 space-y-3">
        {MOCK_TOP_3.map((entry, i) => (
          <div
            key={entry.name}
            className={`glass-card p-4 flex items-center gap-4 animate-fade-in ${i === 0 ? 'ring-2 ring-accent' : ''}`}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                {entry.initials}
              </div>
              <div
                className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${RANK_BADGE_COLOR[i]}`}
              >
                {i + 1}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{entry.name}</p>
              <p className="text-xs text-muted-foreground">{entry.points.toLocaleString(locale)} {t('map.points')}</p>
            </div>
            {i === 0 && <Crown className="h-5 w-5 text-accent shrink-0" />}
          </div>
        ))}

        <div className="glass-card p-5 mt-6 bg-primary/5 border-primary/20 text-center">
          <Sparkles className="h-6 w-6 text-primary mx-auto mb-2" />
          <p className="text-sm font-medium">{t('leaderboard.futureTitle')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('leaderboard.futureDesc')}</p>
        </div>
      </div>
    </div>
  );
};
