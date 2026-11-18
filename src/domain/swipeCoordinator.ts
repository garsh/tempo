/**
 * SwipeCoordinator manages mutual exclusion of open swipe drawers across task cards.
 * Decouples swipe UI state from the application root so that opening or closing a card
 * does not trigger a full React re-render of App.tsx or neighboring cards.
 */
export class SwipeCoordinator {
  private activeTaskId: string | null = null;
  private readonly listeners = new Map<string, (activeId: string | null) => void>();

  public register(taskId: string, onActiveChange: (activeId: string | null) => void): () => void {
    this.listeners.set(taskId, onActiveChange);
    return () => {
      this.listeners.delete(taskId);
      if (this.activeTaskId === taskId) {
        this.activeTaskId = null;
      }
    };
  }

  public notifyOpened(taskId: string): void {
    this.activeTaskId = taskId;
    for (const [id, callback] of this.listeners.entries()) {
      if (id !== taskId) {
        callback(taskId);
      }
    }
  }

  public notifyClosed(taskId: string): void {
    if (this.activeTaskId === taskId) {
      this.activeTaskId = null;
      for (const callback of this.listeners.values()) {
        callback(null);
      }
    }
  }

  public getActiveTaskId(): string | null {
    return this.activeTaskId;
  }
}

export const globalSwipeCoordinator = new SwipeCoordinator();
