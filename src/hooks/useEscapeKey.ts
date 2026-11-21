import { useEffect, useRef } from 'react';

interface UseEscapeKeyOptions {
  capture?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

/**
 * Subscribe to the Escape key while `active` is true, calling `onEscape`.
 */
export function useEscapeKey(
  active: boolean,
  onEscape: () => void,
  options: UseEscapeKeyOptions = {},
): void {
  const { capture = false, preventDefault = false, stopPropagation = false } = options;
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (preventDefault) e.preventDefault();
      if (stopPropagation) e.stopPropagation();
      onEscapeRef.current();
    };
    window.addEventListener('keydown', onKeyDown, capture);
    return () => window.removeEventListener('keydown', onKeyDown, capture);
  }, [active, capture, preventDefault, stopPropagation]);
}
