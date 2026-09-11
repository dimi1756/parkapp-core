import React from 'react';
import { Car } from 'lucide-react';

/**
 * The Smart Search wait.
 *
 * A spinner says "something is happening". This says what: a car is out
 * looking for a space. The search genuinely takes a couple of seconds --
 * a fresh GPS fix, a nearest-spot scan, then a Directions round trip -- and
 * it is the moment the app is most often watched by someone being shown it
 * for the first time.
 *
 * Built from three CSS animations rather than a motion library: the road
 * markings scroll, the car drives across and loops, and it bobs very
 * slightly as if the road were uneven. All three stop under
 * prefers-reduced-motion, leaving a legible static scene.
 */
export const SmartSearchLoader: React.FC = () => (
  <div className="smart-search-scene" aria-hidden="true">
    {/* The road. Its markings scroll right-to-left, which is what sells the
        car as moving rather than sliding across a static strip. */}
    <div className="smart-search-road">
      <div className="smart-search-lane" />
    </div>

    <div className="smart-search-car">
      <Car className="h-7 w-7 text-primary" strokeWidth={2.25} />
    </div>
  </div>
);
