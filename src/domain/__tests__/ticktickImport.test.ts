import { describe, it, expect } from 'vitest';
import { importTasksFromCsv, parseImportDue, parseImportRepeat } from '../ticktickImport';
import { INBOX_LIST_ID } from '../../types/task';

describe('parseImportDue', () => {
  it('parses ISO date and datetime', () => {
    expect(parseImportDue('2026-10-05')).toBe('2026-10-05');
    expect(parseImportDue('2026-10-05 09:30')).toBe('2026-10-05T09:30');
    expect(parseImportDue('2026-10-05T09:30:00+0000')).toBe('2026-10-05T09:30');
  });

  it('strips time for all-day tasks and converts UTC offsets using timezone', () => {
    // 05:00 UTC is midnight EST (UTC-5) — all-day tasks must not get a 05:00 time
    expect(
      parseImportDue('2026-11-13T05:00:00+0000', {
        isAllDay: true,
        timezone: 'America/New_York',
      })
    ).toBe('2026-11-13');

    // Midnight in Asia/Tokyo (UTC+9) is 15:00 UTC the previous day
    expect(
      parseImportDue('2026-11-12T15:00:00+0000', {
        isAllDay: true,
        timezone: 'Asia/Tokyo',
      })
    ).toBe('2026-11-13');

    // Timed task converts UTC offset into the task's timezone
    expect(
      parseImportDue('2026-11-13T14:30:00+0000', {
        isAllDay: false,
        timezone: 'America/New_York',
      })
    ).toBe('2026-11-13T09:30');

    // All-day without timezone still drops the time component
    expect(parseImportDue('2026-11-13T05:00:00+0000', { isAllDay: true })).toBe('2026-11-13');

    // Invalid timezone falls back gracefully without throwing
    expect(
      parseImportDue('2026-11-13T05:00:00+0000', {
        isAllDay: true,
        timezone: 'Invalid/Zone',
      })
    ).toBe('2026-11-13');
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

  it('imports TickTick v7.2 CSV export with metadata preamble', () => {
    const csv = [
      '"Date: 2026-11-13+0000"',
      '"Version: 7.2"',
      '"Status: \n0 Normal\n-1 Abandoned \n2 Completed"',
      '"Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId","projectKind"',
      '"","👋Welcome","Neck Exercises","TEXT","","","N","","","",,"0","2","2024-08-21T11:02:12+0000","2026-10-23T17:11:22+0000","-3023657041920","Pacific/Honolulu","false","false",,,"list","1","24807","TASK"',
      '"","👋Welcome","Active Task","TEXT","#health","Do stretches","N","2026-11-14T07:00:00+0000","2026-11-14T07:00:00+0000","","","3","0","2026-11-01T10:00:00+0000","","-1","America/New_York","true","false",,,"list","2","","TASK"',
    ].join('\n');

    const result = importTasksFromCsv(csv, 1_700_000_000_000);
    expect(result.format).toBe('ticktick');
    expect(result.tasks).toHaveLength(2);
    expect(result.lists).toHaveLength(1);
    expect(result.lists[0].name).toBe('👋Welcome');

    const [doneTask, activeTask] = result.tasks;
    expect(doneTask.title).toBe('Neck Exercises');
    expect(doneTask.completedAt).toBe(Date.parse('2026-10-23T17:11:22+00:00'));
    expect(doneTask.completionHistory).toEqual([doneTask.completedAt]);

    expect(activeTask.title).toBe('Active Task');
    expect(activeTask.completedAt).toBeNull();
    expect(activeTask.dueAt).toBe('2026-11-14');
    expect(activeTask.priority).toBe('medium');
    expect(activeTask.tags).toEqual(['health']);
    expect(activeTask.notes).toBe('Do stretches');
  });
});

describe('parseImportRepeat & recurring CSV import', () => {
  it('parses TickTick RRULE/ERULE and human repeat strings', () => {
    expect(parseImportRepeat('RRULE:FREQ=DAILY;INTERVAL=1')).toEqual({
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'days',
    });
    expect(parseImportRepeat('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR')).toEqual({
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'weeks',
      weekdays: [1, 3, 5],
    });
    expect(parseImportRepeat('RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15')).toEqual({
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'months',
      monthDay: 15,
    });
    expect(parseImportRepeat('RRULE:FREQ=DAILY;INTERVAL=2;REPEATFROM=2')).toEqual({
      type: 'after_completion',
      intervalValue: 2,
      intervalUnit: 'days',
    });
    expect(parseImportRepeat('ERULE:FREQ=WEEKLY;INTERVAL=1')).toEqual({
      type: 'after_completion',
      intervalValue: 1,
      intervalUnit: 'weeks',
    });
    expect(parseImportRepeat('weekdays')).toEqual({
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'weeks',
      weekdays: [1, 2, 3, 4, 5],
    });
  });

  it('imports recurring tasks and merges completed occurrence rows into completionHistory', () => {
    const csv = [
      'Folder Name,List Name,Title,Tags,Content,Start Date,Due Date,Repeat,Priority,Status,Created Time,Completed Time',
      ',Inbox,Daily vitamins,,,2026-10-01,,RRULE:FREQ=DAILY;INTERVAL=1,0,2,2026-10-01T08:00:00+0000,2026-10-05T09:00:00+0000',
      ',Inbox,Daily vitamins,,,2026-10-06,,RRULE:FREQ=DAILY;INTERVAL=1,0,0,2026-10-01T08:00:00+0000,',
    ].join('\n');

    const result = importTasksFromCsv(csv, 1_700_000_000_000);
    expect(result.format).toBe('ticktick');
    expect(result.tasks).toHaveLength(1);
    const t = result.tasks[0];
    expect(t.title).toBe('Daily vitamins');
    expect(t.dueAt).toBe('2026-10-06');
    expect(t.completedAt).toBeNull();
    expect(t.recurrence).toEqual({
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'days',
    });
    expect(t.completionHistory).toEqual([Date.parse('2026-10-05T09:00:00+00:00')]);
  });

  it('merges completed empty-repeat occurrence rows sharing (List, Title, Created Time) with active recurring row', () => {
    const csv = [
      'Folder Name,List Name,Title,Tags,Content,Start Date,Due Date,Repeat,Priority,Status,Created Time,Completed Time',
      ',Inbox,Stretch,,,2026-10-04,,,,2,2026-10-01T08:00:00+0000,2026-10-04T09:00:00+0000',
      ',Inbox,Stretch,,,2026-10-06,,RRULE:FREQ=DAILY;INTERVAL=1,0,0,2026-10-01T08:00:00+0000,',
    ].join('\n');

    const result = importTasksFromCsv(csv, 1_700_000_000_000);
    expect(result.tasks).toHaveLength(1);
    const t = result.tasks[0];
    expect(t.completedAt).toBeNull();
    expect(t.completionHistory).toEqual([Date.parse('2026-10-04T09:00:00+00:00')]);
  });

  it('treats non-recurring Status=0 rows with non-empty Completed Time as completed', () => {
    const csv = [
      'Folder Name,List Name,Title,Tags,Content,Start Date,Due Date,Repeat,Priority,Status,Created Time,Completed Time',
      ',Inbox,Leg Exercises,,,2026-10-03,, ,0,0,2026-10-01T08:00:00+0000,2026-10-03T12:00:00+0000',
    ].join('\n');

    const result = importTasksFromCsv(csv, 1_700_000_000_000);
    expect(result.tasks).toHaveLength(1);
    const t = result.tasks[0];
    expect(t.completedAt).toBe(Date.parse('2026-10-03T12:00:00+00:00'));
    expect(t.completionHistory).toEqual([Date.parse('2026-10-03T12:00:00+00:00')]);
  });

  it('drops orphan undated open rows sharing (List, Title, Created Time) with a recurring/dated task', () => {
    const csv = [
      'Folder Name,List Name,Title,Tags,Content,Start Date,Due Date,Repeat,Priority,Status,Created Time,Completed Time',
      ',Inbox,Clean Upstairs,,,,,,,0,2025-03-26T10:23:56+0000,',
      ',Inbox,Clean Upstairs,,,,,,,0,2025-03-26T10:23:56+0000,',
      ',Inbox,Clean Upstairs,,,2026-10-06,,RRULE:FREQ=WEEKLY;INTERVAL=1,0,0,2025-03-26T10:23:56+0000,',
    ].join('\n');

    const result = importTasksFromCsv(csv, 1_700_000_000_000);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].dueAt).toBe('2026-10-06');
    expect(result.tasks[0].recurrence).toEqual({
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'weeks',
    });
  });
});
