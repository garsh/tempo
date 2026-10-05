/** Pastel pill colors for calendar event chips (TickTick-like). */
export const CAL_PILL_COLORS = [
  '#C8E6C9', // green
  '#BBDEFB', // blue
  '#FFE0B2', // orange
  '#E1BEE7', // purple
  '#F8BBD0', // pink
  '#B2EBF2', // cyan
  '#DCEDC8', // light green
  '#D1C4E9', // deep purple
] as const;

export const LIST_DOT_COLORS = [
  '#4772FA',
  '#34C759',
  '#FF9500',
  '#FF3B30',
  '#AF52DE',
  '#5AC8FA',
  '#FF2D55',
] as const;

export function pillColorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CAL_PILL_COLORS[h % CAL_PILL_COLORS.length];
}

export function listDotColor(index: number): string {
  return LIST_DOT_COLORS[index % LIST_DOT_COLORS.length];
}
