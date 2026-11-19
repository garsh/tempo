// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonthYearPickerDialog } from '../calendar/MonthYearPickerDialog';
import { calendarHeaderTitle, pickerDefaultScrollYear } from '../../domain/calendarUi';

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    rerender(nextUi: ReactElement) {
      act(() => {
        root.render(nextUi);
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function pointerEvent(type: 'pointerdown' | 'pointerup', clientX: number, clientY: number) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
}

describe('MonthYearPickerDialog', () => {
  const fixedToday = new Date(2026, 10, 19);
  const mounted: Array<() => void> = [];

  afterEach(() => {
    while (mounted.length > 0) {
      mounted.pop()!();
    }
    vi.restoreAllMocks();
  });

  it('opens native <dialog> via showModal() when isOpen is true and shows live preview heading', () => {
    const showModalSpy = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const view = mount(
      <MonthYearPickerDialog
        isOpen={true}
        year={2026}
        monthIndex={10}
        today={fixedToday}
        onSelect={vi.fn()}
        onJumpToToday={vi.fn()}
        onClose={vi.fn()}
      />
    );
    mounted.push(view.unmount);

    const dialog = view.container.querySelector('dialog');
    expect(dialog).not.toBeNull();
    expect(showModalSpy).toHaveBeenCalledTimes(1);
    expect(dialog?.open).toBe(true);
    expect(dialog?.querySelector('h2')?.textContent).toBe(calendarHeaderTitle(2026, 10));
  });

  it('updates live preview on year/month clicks and commits on Done', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const view = mount(
      <MonthYearPickerDialog
        isOpen={true}
        year={2026}
        monthIndex={10}
        today={fixedToday}
        onSelect={onSelect}
        onJumpToToday={vi.fn()}
        onClose={onClose}
      />
    );
    mounted.push(view.unmount);

    const dialog = view.container.querySelector('dialog')!;
    const heading = dialog.querySelector('h2')!;
    const year2028 = dialog.querySelector<HTMLButtonElement>('button[data-year="2028"]')!;
    const monthMar = dialog.querySelector<HTMLButtonElement>('button[data-month="2"]')!;
    const doneBtn = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Done')!;

    act(() => {
      year2028.click();
    });
    expect(heading.textContent).toBe(calendarHeaderTitle(2028, 10));
    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      monthMar.click();
    });
    expect(heading.textContent).toBe(calendarHeaderTitle(2028, 2));

    act(() => {
      doneBtn.click();
    });
    expect(onSelect).toHaveBeenCalledWith(2028, 2);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
  });

  it('discards draft changes and closes on Cancel and Close button', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const view = mount(
      <MonthYearPickerDialog
        isOpen={true}
        year={2026}
        monthIndex={10}
        today={fixedToday}
        onSelect={onSelect}
        onJumpToToday={vi.fn()}
        onClose={onClose}
      />
    );
    mounted.push(view.unmount);

    const dialog = view.container.querySelector('dialog')!;
    const year2028 = dialog.querySelector<HTMLButtonElement>('button[data-year="2028"]')!;
    const cancelBtn = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!;

    act(() => {
      year2028.click();
    });
    expect(dialog.querySelector('h2')?.textContent).toBe(calendarHeaderTitle(2028, 10));

    act(() => {
      cancelBtn.click();
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);

    // Reopen (via parent flipping isOpen false -> true) and verify Close ("X") button also discards draft and closes
    view.rerender(
      <MonthYearPickerDialog
        isOpen={false}
        year={2026}
        monthIndex={10}
        today={fixedToday}
        onSelect={onSelect}
        onJumpToToday={vi.fn()}
        onClose={onClose}
      />
    );
    view.rerender(
      <MonthYearPickerDialog
        isOpen={true}
        year={2026}
        monthIndex={10}
        today={fixedToday}
        onSelect={onSelect}
        onJumpToToday={vi.fn()}
        onClose={onClose}
      />
    );
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('h2')?.textContent).toBe(calendarHeaderTitle(2026, 10));

    const closeBtn = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
    act(() => {
      closeBtn.click();
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(dialog.open).toBe(false);
  });

  it('light-dismisses when pointerdown and pointerup are outside dialog bounds, but not on inside-to-outside drag', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const view = mount(
      <MonthYearPickerDialog
        isOpen={true}
        year={2026}
        monthIndex={10}
        today={fixedToday}
        onSelect={onSelect}
        onJumpToToday={vi.fn()}
        onClose={onClose}
      />
    );
    mounted.push(view.unmount);

    const dialog = view.container.querySelector('dialog')!;
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      right: 440,
      bottom: 420,
      width: 340,
      height: 320,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    // Drag starting inside (200, 200) and ending outside (20, 20) must NOT dismiss
    act(() => {
      dialog.dispatchEvent(pointerEvent('pointerdown', 200, 200));
      dialog.dispatchEvent(pointerEvent('pointerup', 20, 20));
    });
    expect(dialog.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    // Click starting and ending outside (20, 20) must dismiss and discard changes
    act(() => {
      dialog.querySelector<HTMLButtonElement>('button[data-year="2030"]')!.click();
    });
    act(() => {
      dialog.dispatchEvent(pointerEvent('pointerdown', 20, 20));
      dialog.dispatchEvent(pointerEvent('pointerup', 25, 25));
    });
    expect(dialog.open).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onJumpToToday and closes when clicking Today', () => {
    const onSelect = vi.fn();
    const onJumpToToday = vi.fn();
    const onClose = vi.fn();
    const view = mount(
      <MonthYearPickerDialog
        isOpen={true}
        year={2030}
        monthIndex={5}
        today={fixedToday}
        onSelect={onSelect}
        onJumpToToday={onJumpToToday}
        onClose={onClose}
      />
    );
    mounted.push(view.unmount);

    const dialog = view.container.querySelector('dialog')!;
    const todayBtn = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Today')!;

    act(() => {
      todayBtn.click();
    });
    expect(onJumpToToday).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
  });

  it('renders past years before currentYear and scrolls to anchor currentYear row at the top by default', () => {
    const onClose = vi.fn();
    const view = mount(
      <MonthYearPickerDialog
        isOpen={false}
        year={2026}
        monthIndex={10}
        today={fixedToday}
        onSelect={vi.fn()}
        onJumpToToday={vi.fn()}
        onClose={onClose}
      />
    );
    mounted.push(view.unmount);

    const yearsContainer = view.container.querySelector<HTMLDivElement>(
      '[data-testid="month-year-picker-years"]'
    )!;
    const yearButtons = [...yearsContainer.querySelectorAll<HTMLButtonElement>('button[data-year]')];
    const renderedYears = yearButtons.map((b) => Number(b.dataset.year));
    const idx2026 = renderedYears.indexOf(2026);
    expect(idx2026).toBeGreaterThan(0);
    expect(renderedYears[0]).toBeLessThan(2026);
    expect(renderedYears[renderedYears.length - 1]).toBeGreaterThan(2026);

    // Mock layout offsets so we can verify scrollTop anchoring math
    Object.defineProperty(yearsContainer, 'offsetTop', { configurable: true, value: 10 });
    yearButtons.forEach((btn, idx) => {
      const row = Math.floor(idx / 4);
      Object.defineProperty(btn, 'offsetTop', { configurable: true, value: 10 + row * 42 });
    });

    // Open while viewing 2026 -> anchors at 2026's row
    view.rerender(
      <MonthYearPickerDialog
        isOpen={true}
        year={2026}
        monthIndex={10}
        today={fixedToday}
        onSelect={vi.fn()}
        onJumpToToday={vi.fn()}
        onClose={onClose}
      />
    );
    const btn2026 = yearsContainer.querySelector<HTMLButtonElement>('button[data-year="2026"]')!;
    expect(yearsContainer.scrollTop).toBe(btn2026.offsetTop - yearsContainer.offsetTop);

    // Close and reopen while viewing a past year (2025) -> anchors at 2022's row
    view.rerender(
      <MonthYearPickerDialog
        isOpen={false}
        year={2025}
        monthIndex={10}
        today={fixedToday}
        onSelect={vi.fn()}
        onJumpToToday={vi.fn()}
        onClose={onClose}
      />
    );
    view.rerender(
      <MonthYearPickerDialog
        isOpen={true}
        year={2025}
        monthIndex={10}
        today={fixedToday}
        onSelect={vi.fn()}
        onJumpToToday={vi.fn()}
        onClose={onClose}
      />
    );
    const pastAnchorYear = pickerDefaultScrollYear(2025, 2026);
    const btnPastAnchor = yearsContainer.querySelector<HTMLButtonElement>(
      `button[data-year="${pastAnchorYear}"]`
    )!;
    expect(yearsContainer.scrollTop).toBe(btnPastAnchor.offsetTop - yearsContainer.offsetTop);
  });
});
