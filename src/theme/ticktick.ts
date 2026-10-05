/** TickTick-inspired visual tokens (light chrome). */
export const TT = {
  blue: '#4772FA',
  blueSoft: '#E8EEFE',
  blueHover: '#3B63E6',
  sidebar: '#F5F5F7',
  rail: '#2C2C2E',
  railAlt: '#3A3A3C',
  surface: '#FFFFFF',
  border: '#E8E8ED',
  text: '#1C1C1E',
  textSecondary: '#8E8E93',
  textMuted: '#AEAEB2',
  overdue: '#E03131',
  priority: {
    high: '#E03131',
    medium: '#FAA80C',
    low: '#4772FA',
    none: '#C7C7CC',
  },
} as const;

export type PriorityKey = keyof typeof TT.priority;

export function priorityCheckboxColor(
  priority: string | null | undefined
): string {
  const p = (priority || 'none') as PriorityKey;
  return TT.priority[p] ?? TT.priority.none;
}
