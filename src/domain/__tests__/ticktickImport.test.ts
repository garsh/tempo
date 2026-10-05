import { describe, it, expect } from 'vitest';
import { importTasksFromCsv, parseImportDue } from '../ticktickImport';
import { INBOX_LIST_ID } from '../../types/task';

describe('parseImportDue', () => {
  it('parses ISO date and datetime', () => {
    expect(parseImportDue('2026-10-05')).toBe('2026-10-05');
    expect(parseImportDue('2026-10-05 09:30')).toBe('2026-10-05T09:30');
    expect(parseImportDue('2026-10-05T09:30:00+0000')).toBe('2026-10-05T09:30');
  });
});

describe('importTasksFromCsv', () => {
  it('imports TickTick-style CSV', () => {
    const csv = [
      'Folder Name,List Name,Title,Tags,Content,Due Date,Priority,Status,Created Time,Completed Time',
      'Work,Inbox,Ship Phase 5,#tempo #pwa,Notes here,2026-10-06T10:00:00+0000,5,0,2026-10-01T08:00:00+0000,',
      'Work,Inbox,,,#skip me,,,,,,,',
    ].join('\n');

    const result = importTasksFromCsv(csv, 1_700_000_000_000);
    expect(result.format).toBe('ticktick');
    expect(result.tasks).toHaveLength(1);
    expect(result.skipped).toBe(1);
    const t = result.tasks[0];
    expect(t.title).toBe('Ship Phase 5');
    expect(t.dueAt).toBe('2026-10-06T10:00');
    expect(t.priority).toBe('high');
    expect(t.tags).toEqual(['tempo', 'pwa']);
    expect(t.notes).toBe('Notes here');
    expect(t.listId).toBe(INBOX_LIST_ID);
  });

  it('imports generic CSV and creates lists', () => {
    const csv = 'title,list,due,priority,tags,notes,status\nCall mom,Personal,2026-10-07,low,family,Hi,open\n';
    const result = importTasksFromCsv(csv);
    expect(result.format).toBe('generic');
    expect(result.tasks).toHaveLength(1);
    expect(result.lists).toHaveLength(1);
    expect(result.lists[0].name).toBe('Personal');
    expect(result.tasks[0].listId).toBe(result.lists[0].id);
    expect(result.tasks[0].priority).toBe('low');
  });
});
