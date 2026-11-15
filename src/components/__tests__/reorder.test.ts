import { describe, it, expect } from 'vitest';
import { moveItemToSlot } from '../../domain/reorder';

describe('moveItemToSlot', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('moves an earlier item between two later items', () => {
    expect(moveItemToSlot(items, 0, 2)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveItemToSlot(items, 0, 4)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('moves a later item before an earlier item', () => {
    expect(moveItemToSlot(items, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItemToSlot(items, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns the same array reference when dropped into its current slot', () => {
    expect(moveItemToSlot(items, 1, 1)).toBe(items);
    expect(moveItemToSlot(items, 1, 2)).toBe(items);
  });
});
