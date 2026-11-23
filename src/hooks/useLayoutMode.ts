import { useEffect, useState } from 'react';

export const MEDIA_SPLIT = '(min-width: 640px), (orientation: landscape) and (min-width: 568px)';
export const MEDIA_COMPACT_LANDSCAPE =
  '(orientation: landscape) and (min-width: 568px) and (max-height: 540px)';
export const MEDIA_DESKTOP = '(min-width: 1024px) and (min-height: 541px)';
export const MEDIA_WIDE_DESKTOP = '(min-width: 1280px) and (min-height: 541px)';

export type LayoutTier =
  | 'portrait'
  | 'compact-landscape'
  | 'medium-split'
  | 'desktop'
  | 'wide-desktop';

export interface LayoutMode {
  tier: LayoutTier;
  isSplit: boolean;
  isCompactLandscape: boolean;
  isDesktop: boolean;
  isWideDesktop: boolean;
}

export function computeLayoutMode(matches: {
  split: boolean;
  compactLandscape: boolean;
  desktop: boolean;
  wideDesktop: boolean;
}): LayoutMode {
  if (matches.wideDesktop) {
    return {
      tier: 'wide-desktop',
      isSplit: true,
      isCompactLandscape: false,
      isDesktop: true,
      isWideDesktop: true,
    };
  }
  if (matches.desktop) {
    return {
      tier: 'desktop',
      isSplit: true,
      isCompactLandscape: false,
      isDesktop: true,
      isWideDesktop: false,
    };
  }
  if (matches.compactLandscape) {
    return {
      tier: 'compact-landscape',
      isSplit: true,
      isCompactLandscape: true,
      isDesktop: false,
      isWideDesktop: false,
    };
  }
  if (matches.split) {
    return {
      tier: 'medium-split',
      isSplit: true,
      isCompactLandscape: false,
      isDesktop: false,
      isWideDesktop: false,
    };
  }
  return {
    tier: 'portrait',
    isSplit: false,
    isCompactLandscape: false,
    isDesktop: false,
    isWideDesktop: false,
  };
}

function readMatchMediaSnapshot(): LayoutMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return computeLayoutMode({
      split: false,
      compactLandscape: false,
      desktop: false,
      wideDesktop: false,
    });
  }
  return computeLayoutMode({
    split: window.matchMedia(MEDIA_SPLIT).matches,
    compactLandscape: window.matchMedia(MEDIA_COMPACT_LANDSCAPE).matches,
    desktop: window.matchMedia(MEDIA_DESKTOP).matches,
    wideDesktop: window.matchMedia(MEDIA_WIDE_DESKTOP).matches,
  });
}

function sameLayoutMode(a: LayoutMode, b: LayoutMode): boolean {
  return (
    a.tier === b.tier &&
    a.isSplit === b.isSplit &&
    a.isCompactLandscape === b.isCompactLandscape &&
    a.isDesktop === b.isDesktop &&
    a.isWideDesktop === b.isWideDesktop
  );
}

/**
 * Tracks Tempo's responsive layout tier across Mobile Portrait, Compact Mobile Landscape,
 * Medium Split (tablets / narrow windows), Desktop (1024–1279px), and Wide Desktop (1280px+).
 */
export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(readMatchMediaSnapshot);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const queries = [
      window.matchMedia(MEDIA_SPLIT),
      window.matchMedia(MEDIA_COMPACT_LANDSCAPE),
      window.matchMedia(MEDIA_DESKTOP),
      window.matchMedia(MEDIA_WIDE_DESKTOP),
    ];

    const sync = () => {
      const next = readMatchMediaSnapshot();
      setMode((prev) => (sameLayoutMode(prev, next) ? prev : next));
    };

    sync();

    for (const mq of queries) {
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', sync);
      } else {
        mq.addListener(sync);
      }
    }

    return () => {
      for (const mq of queries) {
        if (typeof mq.removeEventListener === 'function') {
          mq.removeEventListener('change', sync);
        } else {
          mq.removeListener(sync);
        }
      }
    };
  }, []);

  return mode;
}
