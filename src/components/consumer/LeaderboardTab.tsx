import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLeaderboard, type LeaderboardPeriod } from '@/hooks/useLeaderboard';
import { getBadgeForPoints } from '@/lib/badges';
import { Trophy, Crown, Sparkles, Loader2 } from 'lucide-react';

const RANK_BADGE_COLOR = ['bg-accent', 'bg-slate-400', 'bg-amber-700'];

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export const LeaderboardTab = () => {
  const { t, locale } = useLanguage();
  const { profile } = useAuth();
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const { entries, loading } = useLeaderboard(period);

  const ownBadge = getBadgeForPoints(profile?.points_balance ?? 0);
  const ownRankIndex = entries.findIndex((e) => e.isCurrentUser);

  return (
    <div className="h-full overflow-y-auto pb-24">
      <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6 pb-10 text-center" data-tour="leaderboard-title">
        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
          <Trophy className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold">{t('leaderboard.title')}</h1>

        <div className="inline-flex mt-3 bg-white/15 rounded-full p-1">
          {(['daily', 'weekly'] as LeaderboardPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                period === p ? 'bg-white text-primary' : 'text-primary-foreground/80'
              }`}
            >
              {t(p === 'daily' ? 'leaderboard.daily' : 'leaderboard.weekly')}
            </button>
          ))}
        </div>

        {profile && (
          <div className="mt-4 inline-flex items-center gap-2 bg-white/15 rounded-full px-3 py-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ownBadge.colorClass}`}>
              {t(ownBadge.labelKey)}
            </span>
            <span className="text-xs">
              {t('leaderboard.yourRank')}: {ownRankIndex >= 0 ? `#${ownRankIndex + 1}` : t('leaderboard.notRanked')}
            </span>
          </div>
        )}
      </div>

      <div className="p-4 -mt-6 space-y-3">
        {loading ? (
          <div className="glass-card p-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : entries.length === 0 ? (
          <div className="glass-card p-6 text-center animate-fade-in">
            <Trophy className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="font-semibold text-sm">{t('leaderboard.empty')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('leaderboard.emptyDesc')}</p>
          </div>
        ) : (
          <div className="space-y-3" data-tour="leaderboard-podium">
            {entries.map((entry, i) => {
              const badge = getBadgeForPoints(entry.points);
              return (
                <div
                  key={entry.userId}
                  className={`glass-card p-4 flex items-center gap-4 animate-fade-in ${i === 0 ? 'ring-2 ring-accent' : ''} ${
                    entry.isCurrentUser ? 'bg-primary/5 border-primary/30' : ''
                  }`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                      {initialsOf(entry.fullName)}
                    </div>
                    {i < 3 && (
                      <div
                        className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${RANK_BADGE_COLOR[i]}`}
                      >
                        {i + 1}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">
                      {entry.fullName}
                      {entry.isCurrentUser && <span className="text-primary"> · {t('leaderboard.yourRank')}</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground">{entry.points.toLocaleString(locale)} {t('map.points')}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.colorClass}`}>
                        {t(badge.labelKey)}
                      </span>
                    </div>
                  </div>
                  {i === 0 && <Crown className="h-5 w-5 text-accent shrink-0" />}
                </div>
              );
            })}
          </div>
        )}

        <div className="glass-card p-5 mt-6 bg-primary/5 border-primary/20 text-center" data-tour="leaderboard-future">
          <Sparkles className="h-6 w-6 text-primary mx-auto mb-2" />
          <p className="text-sm font-medium">{t('leaderboard.futureTitle')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('leaderboard.futureDesc')}</p>
        </div>
      </div>
    </div>
  );
};
