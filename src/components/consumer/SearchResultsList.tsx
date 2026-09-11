import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { PlaceSuggestion } from './MapboxMap';
import { placeHours, placeRating, formatPlaceDistance } from '@/lib/placeMeta';
import {
  MapPin,
  Star,
  Pill,
  Utensils,
  Coffee,
  BedDouble,
  Fuel,
  ShoppingBag,
  Landmark,
  GraduationCap,
  Stethoscope,
  CircleParking,
  type LucideIcon,
} from 'lucide-react';

interface SearchResultsListProps {
  results: PlaceSuggestion[];
  onSelect: (place: PlaceSuggestion) => void;
}

/**
 * Mapbox category -> row icon. Matched by substring because the API returns
 * compound categories ("pharmacy", "chemist_pharmacy", "food_and_drink"),
 * and the first match wins, so more specific entries come first.
 */
const CATEGORY_ICONS: [string, LucideIcon][] = [
  ['pharmac', Pill],
  ['chemist', Pill],
  ['hospital', Stethoscope],
  ['doctor', Stethoscope],
  ['clinic', Stethoscope],
  ['cafe', Coffee],
  ['coffee', Coffee],
  ['bar', Coffee],
  ['restaurant', Utensils],
  ['food', Utensils],
  ['hotel', BedDouble],
  ['lodging', BedDouble],
  ['fuel', Fuel],
  ['gas', Fuel],
  ['charging', Fuel],
  ['parking', CircleParking],
  ['school', GraduationCap],
  ['university', GraduationCap],
  ['education', GraduationCap],
  ['bank', Landmark],
  ['atm', Landmark],
  ['museum', Landmark],
  ['shop', ShoppingBag],
  ['store', ShoppingBag],
  ['market', ShoppingBag],
];

function iconFor(category?: string): LucideIcon {
  if (!category) return MapPin;
  const key = category.toLowerCase();
  return CATEGORY_ICONS.find(([needle]) => key.includes(needle))?.[1] ?? MapPin;
}

/**
 * The search dropdown.
 *
 * Name, address and distance are real -- the distance is the one Mapbox
 * measures against the same point the search is biased toward. The rating,
 * review count and opening hours are sample data derived from the result's
 * id (see src/lib/placeMeta.ts); the footer line says so on screen rather
 * than only in the source.
 */
export const SearchResultsList: React.FC<SearchResultsListProps> = ({ results, onSelect }) => {
  const { t, locale } = useLanguage();
  const now = new Date();

  return (
    <div className="absolute left-0 right-0 top-full mt-2 glass-card p-1.5 max-h-[22rem] overflow-y-auto z-30 animate-fade-in">
      {results.map((place) => {
        const Icon = iconFor(place.category);
        const { rating, reviews } = placeRating(place.id);
        const hours = placeHours(place.id, now);
        const distance =
          place.distanceMeters === undefined ? '' : formatPlaceDistance(place.distanceMeters);

        return (
          <button
            key={place.id}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(place);
            }}
            className="w-full text-left px-3 py-3 rounded-2xl hover:bg-secondary/70 active:bg-secondary transition-colors flex items-start gap-3"
          >
            <span className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="h-[18px] w-[18px] text-primary" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="block text-sm font-semibold truncate flex-1">{place.name}</span>
                {distance && (
                  <span className="text-xs font-medium text-muted-foreground shrink-0">{distance}</span>
                )}
              </span>

              {/* Rating line -- sample data, see the footer note. */}
              <span className="flex items-center gap-1.5 mt-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                <span className="text-xs font-semibold">{rating.toLocaleString(locale)}</span>
                <span className="text-xs text-muted-foreground">({reviews})</span>
                <span className="text-muted-foreground/50 text-xs">·</span>
                <span
                  className={`text-xs font-medium ${hours.open ? 'text-emerald-600' : 'text-muted-foreground'}`}
                >
                  {t(hours.open ? 'search.open' : 'search.closed')}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {t(hours.open ? 'search.closesAt' : 'search.opensAt', { time: hours.time })}
                </span>
              </span>

              {place.address && (
                <span className="block text-xs text-muted-foreground truncate mt-0.5">{place.address}</span>
              )}
            </span>
          </button>
        );
      })}

      <p className="text-[10px] text-muted-foreground/80 px-3 pt-1.5 pb-1">{t('search.sampleData')}</p>
    </div>
  );
};
