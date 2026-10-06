/**
 * TickTick-inspired visual tokens.
 *
 * Values are CSS custom-property references (defined in `src/index.css`) so they
 * follow `prefers-color-scheme` automatically when used in inline styles / SVG.
 */
export const TT = {
  blue: 'var(--tt-blue)',
  blueSoft: 'var(--tt-blue-soft)',
  blueHover: 'var(--tt-blue-hover)',
  bg: 'var(--tt-bg)',
  sidebar: 'var(--tt-sidebar)',
  rail: 'var(--tt-rail)',
  surface: 'var(--tt-surface)',
  elevated: 'var(--tt-elevated)',
  border: 'var(--tt-border)',
  text: 'var(--tt-text)',
  textSecondary: 'var(--tt-secondary)',
  textMuted: 'var(--tt-muted)',
  overdue: 'var(--tt-overdue)',
  priority: {
    high: 'var(--tt-pri-high)',
    medium: 'var(--tt-pri-med)',
    low: 'var(--tt-pri-low)',
    none: 'var(--tt-pri-none)',
  },
} as const;

export type PriorityKey = keyof typeof TT.priority;

export function priorityCheckboxColor(
  priority: string | null | undefined
): string {
  const p = (priority || 'none') as PriorityKey;
  return TT.priority[p] ?? TT.priority.none;
}
