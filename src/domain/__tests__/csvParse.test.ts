import { describe, it, expect } from 'vitest';
import { parseCsv, rowsToObjects } from '../csvParse';

describe('parseCsv', () => {
  it('parses simple and quoted fields', () => {
    const rows = parseCsv('a,b\n1,"2,3"\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2,3'],
    ]);
  });

  it('handles escaped quotes', () => {
    const rows = parseCsv('title\n"say ""hi"""\n');
    expect(rows[1][0]).toBe('say "hi"');
  });

  it('maps rows to objects', () => {
    const objs = rowsToObjects(parseCsv('Title,Due\nBuy milk,2026-10-06\n'));
    expect(objs).toEqual([{ Title: 'Buy milk', Due: '2026-10-06' }]);
  });
});
