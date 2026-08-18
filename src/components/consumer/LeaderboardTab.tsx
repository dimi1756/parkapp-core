import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLeaderboard, type LeaderboardPeriod } from '@/hooks/useLeaderboard';
import { useCityLeaderboard } from '@/hooks/useCityLeaderboard';
import { getBadgeForPoints } from '@/lib/badges';
import { LeagueModal } from './LeagueModal';
import { Trophy, Crown, Loader2, AlertTriangle, Building2, ChevronRight } from 'lucide-react';

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
  const [leagueOpen, setLeagueOpen] = useState(false);
  const { entries, loading, error } = useLeaderboard(period);
  const { entries: cityEntries, loading: cityLoading, error: cityError } = useCityLeaderboard();

  const ownPoints = profile?.points_balance ?? 0;
  const ownBadge = getBadgeForPoints(ownPoints);
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
          // Clickable -- opens the League/progression modal (tiers + points
          // to the next one), see LeagueModal.tsx.
          <button
            onClick={() => setLeagueOpen(true)}
            className="mt-4 inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 transition-colors rounded-full px-3 py-1.5"
          >
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ownBadge.colorClass}`}>
              {t(ownBadge.labelKey)}
            </span>
            <span className="text-xs">
              {t('leaderboard.yourRank')}: {ownRankIndex >= 0 ? `#${ownRankIndex + 1}` : t('leaderboard.notRanked')}
            </span>
            <ChevronRight className="h-3.5 w-3.5 opacity-70" />
          </button>
        )}
      </div>

      <div className="p-4 -mt-6 space-y-3">
        {loading ? (
          <div className="glass-card p-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error && entries.length === 0 ? (
          // Distinct from the genuine-empty-board state below -- previously
          // a load failure fell through to "no rankings yet", which reads
          // as "nobody's played" instead of "we couldn't fetch this".
          <div className="glass-card p-6 text-center animate-fade-in">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            <p className="font-semibold text-sm">{t('leaderboard.loadError')}</p>
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

        {/* City Leaderboard -- ranks municipalities by total points their
            drivers have generated (city_leaderboard view, 0010_*.sql).
            Replaces the old static "Coming Soon" placeholder. */}
        <div className="pt-2" data-tour="leaderboard-future">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-bold text-sm">{t('cityLeaderboard.title')}</h2>
          </div>

          {cityLoading ? (
            <div className="glass-card p-6 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : cityError && cityEntries.length === 0 ? (
            <div className="glass-card p-5 text-center">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-destructive" />
              <p className="text-sm font-medium">{t('cityLeaderboard.loadError')}</p>
            </div>
          ) : cityEntries.length === 0 ? (
            <div className="glass-card p-5 text-center">
              <Building2 className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">{t('cityLeaderboard.empty')}</p>
            </div>
          ) : (
            <div className="glass-card divide-y divide-border overflow-hidden">
              {cityEntries.map((city, i) => (
                <div
                  key={city.municipalityId}
                  className={`flex items-center gap-3 p-3.5 ${city.isOwnCity ? 'bg-primary/5' : ''}`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      i === 0 ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0 font-medium text-sm truncate">
                    {city.name}
                    {city.isOwnCity && <span className="text-primary"> · {t('cityLeaderboard.yourCity')}</span>}
                  </span>
                  <span className="text-sm font-bold text-primary shrink-0">
                    {city.totalPoints.toLocaleString(locale)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <LeagueModal points={ownPoints} open={leagueOpen} onOpenChange={setLeagueOpen} />
    </div>
  );
};
