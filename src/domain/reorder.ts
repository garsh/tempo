/**
 * Given a list of items, move the item at `fromIndex` to the insertion slot `targetIndex`
 * (where `0 <= targetIndex <= items.length` is the gap before `items[targetIndex]`).
 */
export function moveItemToSlot<T>(items: T[], fromIndex: number, targetIndex: number): T[] {
  const insertAt = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
  if (insertAt === fromIndex || fromIndex < 0 || fromIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(next.length, insertAt)), 0, moved);
  return next;
}
