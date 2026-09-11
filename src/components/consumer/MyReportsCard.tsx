import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMyReports, type MyReport } from '@/hooks/useMyReports';
import { History, MapPin, Loader2, AlertTriangle, ChevronDown } from 'lucide-react';

/** How many rows show before "see all". Five fills the card without turning it into a page. */
const COLLAPSED_COUNT = 3;

/**
 * Date and time in the driver's own locale, split so the row can lead with
 * the day and keep the clock time subordinate.
 */
function formatWhen(iso: string, locale: string): { day: string; time: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: '', time: '' };
  return {
    day: date.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    time: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
  };
}

const ReportRow: React.FC<{ report: MyReport; locale: string; fallback: string }> = ({
  report,
  locale,
  fallback,
}) => {
  const { day, time } = formatWhen(report.declaredAt, locale);
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="w-9 h-9 rounded-2xl bg-success/10 flex items-center justify-center shrink-0">
        <MapPin className="h-4 w-4 text-success" />
      </span>

      <span className="min-w-0 flex-1">
        {/* The street is the useful part, so it leads -- and it arrives a
            moment after the row does, since it comes from reverse geocoding.
            The coordinates stand in until then rather than an empty line
            that would make the row jump when the name lands. */}
        <span className="block text-sm font-semibold truncate">{report.street ?? fallback}</span>
        <span className="block text-xs text-muted-foreground">
          {day} · {time}
        </span>
      </span>

      {report.points > 0 && (
        <span className="text-xs font-bold text-success shrink-0 tabular-nums">
          +{report.points}
        </span>
      )}
    </div>
  );
};

/**
 * "My Reports" -- every spot this driver has declared.
 *
 * The map now expires a pin five minutes after it is declared, which is the
 * right lifetime for something drivers navigate to and the wrong one for a
 * record of what somebody contributed. This is where that record lives
 * instead: the declaration does not disappear, it moves here.
 */
export const MyReportsCard: React.FC = () => {
  const { t, locale } = useLanguage();
  const { reports, loading, error } = useMyReports();
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? reports : reports.slice(0, COLLAPSED_COUNT);
  const hidden = reports.length - visible.length;

  return (
    <div className="glass-card p-5" data-tour="profile-reports">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <History className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{t('reports.title')}</p>
          <p className="text-[11px] text-muted-foreground">{t('reports.subtitle')}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : error ? (
        // Distinct from the empty state: "we couldn't load this" is not the
        // same message as "you haven't reported anything yet", and telling a
        // contributor the second when the first is true erases their work.
        <div className="flex items-center gap-2 py-5 text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-xs">{t('reports.loadError')}</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="py-5 text-center">
          <p className="text-sm font-medium">{t('reports.empty')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('reports.emptyDesc')}</p>
        </div>
      ) : (
        <>
          <div className="mt-2 divide-y divide-border">
            {visible.map((report) => (
              <ReportRow
                key={report.id}
                report={report}
                locale={locale}
                fallback={t('reports.unknownStreet')}
              />
            ))}
          </div>

          {hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full mt-2 pt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
            >
              {t('reports.showAll', { n: hidden })}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
};
