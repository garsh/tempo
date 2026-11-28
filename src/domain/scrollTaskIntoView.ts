export const TASK_SCROLL_CONTAINER_ATTR = 'data-task-scroll-container';

/**
 * Locate the rendered task row element matching `taskId`.
 */
export function findTaskElementById(
  taskId: string,
  root: ParentNode = document,
): HTMLElement | null {
  if (!taskId) return null;
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return root.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`);
  }
  const candidates = root.querySelectorAll<HTMLElement>('[data-task-id]');
  for (const el of candidates) {
    if (el.dataset.taskId === taskId) {
      return el;
    }
  }
  return null;
}

/**
 * Find the nearest scrollable task list container for `taskEl`, preferring
 * explicitly marked task scroll containers and falling back to overflow-y ancestors.
 */
export function findTaskScrollContainer(el: HTMLElement): HTMLElement | null {
  const marked = el.closest<HTMLElement>(`[${TASK_SCROLL_CONTAINER_ATTR}="true"]`);
  if (marked) return marked;

  let current = el.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    const overflowY = getComputedStyle(current).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Check whether the user has requested reduced motion.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Scroll only the task list's own scroll container so `taskEl` is visible,
 * respecting bottom padding clearance (e.g. mobile FAB space) and reduced motion.
 * Returns `true` if a scroll was triggered.
 */
export function scrollTaskElementIntoView(
  taskEl: HTMLElement,
  options?: { behavior?: ScrollBehavior },
): boolean {
  const container = findTaskScrollContainer(taskEl);
  if (!container) return false;

  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  if (maxScrollTop <= 0) return false;

  const containerRect = container.getBoundingClientRect();
  const elRect = taskEl.getBoundingClientRect();
  if (containerRect.height <= 0) return false;

  const style = getComputedStyle(container);
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;

  const bottomClearance = Math.min(paddingBottom, Math.max(0, containerRect.height - elRect.height));
  const visibleBottom = containerRect.bottom - bottomClearance;
  const visibleTop = containerRect.top;

  let delta = 0;
  if (elRect.bottom > visibleBottom) {
    delta = elRect.bottom - visibleBottom;
    // Clamp so a tall card's top is not pushed above the container's top edge.
    const maxDownDelta = Math.max(0, elRect.top - visibleTop);
    if (delta > maxDownDelta) {
      delta = maxDownDelta;
    }
  } else if (elRect.top < visibleTop) {
    delta = elRect.top - visibleTop - Math.min(paddingTop, 12);
  }

  if (Math.abs(delta) < 1) return false;

  const targetScrollTop = Math.min(maxScrollTop, Math.max(0, container.scrollTop + delta));
  if (Math.abs(targetScrollTop - container.scrollTop) < 1) return false;

  const behavior: ScrollBehavior =
    options?.behavior ?? (prefersReducedMotion() ? 'auto' : 'smooth');

  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ top: targetScrollTop, behavior });
  } else {
    container.scrollTop = targetScrollTop;
  }

  return true;
}
