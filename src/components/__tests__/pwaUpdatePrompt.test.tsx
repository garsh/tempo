// @vitest-environment happy-dom
import {
  act,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaUpdatePrompt, triggerAppUpdate } from '../PwaUpdatePrompt';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pwaMockState = vi.hoisted(() => ({
  registration: null as ServiceWorkerRegistration | null,
  onNeedReload: undefined as (() => void) | undefined,
  setNeedRefresh: null as Dispatch<SetStateAction<boolean>> | null,
  autoRegister: true,
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: {
    onRegisteredSW?: (swUrl: string, reg: ServiceWorkerRegistration | undefined) => void;
    onNeedReload?: () => void;
  }) => {
    const [needRefresh, setNeedRefresh] = useState(false);
    const [offlineReady, setOfflineReady] = useState(false);
    const registeredRef = useRef(false);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    pwaMockState.onNeedReload = options?.onNeedReload;
    pwaMockState.setNeedRefresh = setNeedRefresh;

    useEffect(() => {
      if (!registeredRef.current && pwaMockState.autoRegister && pwaMockState.registration) {
        registeredRef.current = true;
        optionsRef.current?.onRegisteredSW?.('/sw.js', pwaMockState.registration);
      }
    }, []);

    return {
      needRefresh: [needRefresh, setNeedRefresh] as const,
      offlineReady: [offlineReady, setOfflineReady] as const,
      updateServiceWorker: vi.fn(async () => {}),
    };
  },
}));

class FakeServiceWorker extends EventTarget {
  state: ServiceWorkerState;
  scriptURL = 'https://tempo.example/sw.js';
  onstatechange: ((this: ServiceWorker, ev: Event) => unknown) | null = null;
  onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null;
  postMessage = vi.fn((_message: unknown) => {});

  constructor(initialState: ServiceWorkerState) {
    super();
    this.state = initialState;
  }

  setState(nextState: ServiceWorkerState) {
    this.state = nextState;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeServiceWorkerRegistration extends EventTarget {
  installing: FakeServiceWorker | null = null;
  waiting: FakeServiceWorker | null = null;
  active: FakeServiceWorker | null = null;
  scope = 'https://tempo.example/';
  updateViaCache: ServiceWorkerUpdateViaCache = 'imports';
  navigationPreload = {} as NavigationPreloadManager;
  pushManager = {} as PushManager;
  onupdatefound: ((this: ServiceWorkerRegistration, ev: Event) => unknown) | null = null;
  update = vi.fn(async () => {});
  unregister = vi.fn(async () => true);
  showNotification = vi.fn(async () => {});
  getNotifications = vi.fn(async () => []);
}

class FakeServiceWorkerContainer extends EventTarget {
  controller: FakeServiceWorker | null = null;
  registration: FakeServiceWorkerRegistration | null = null;
  ready: Promise<ServiceWorkerRegistration>;
  oncontrollerchange: ((this: ServiceWorkerContainer, ev: Event) => unknown) | null = null;
  onmessage: ((this: ServiceWorkerContainer, ev: MessageEvent) => unknown) | null = null;
  onmessageerror: ((this: ServiceWorkerContainer, ev: MessageEvent) => unknown) | null = null;

  constructor(reg: FakeServiceWorkerRegistration | null) {
    super();
    this.registration = reg;
    this.ready = Promise.resolve(reg as unknown as ServiceWorkerRegistration);
  }

  getRegistration = vi.fn(async () =>
    (this.registration ?? undefined) as unknown as ServiceWorkerRegistration | undefined
  );
  getRegistrations = vi.fn(async () =>
    this.registration ? [this.registration as unknown as ServiceWorkerRegistration] : []
  );
  register = vi.fn(async () => this.registration as unknown as ServiceWorkerRegistration);
  startMessages = vi.fn();

  dispatchControllerChange(nextController: FakeServiceWorker | null) {
    this.controller = nextController;
    this.dispatchEvent(new Event('controllerchange'));
  }
}

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(label)
  );
}

describe('PwaUpdatePrompt', () => {
  let originalSwDesc: PropertyDescriptor | undefined;
  let originalOnLineDesc: PropertyDescriptor | undefined;
  let originalVisibilityDesc: PropertyDescriptor | undefined;
  let swContainer: FakeServiceWorkerContainer;
  let reg: FakeServiceWorkerRegistration;

  beforeEach(() => {
    vi.useFakeTimers();

    originalSwDesc = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    originalOnLineDesc = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    originalVisibilityDesc = Object.getOwnPropertyDescriptor(document, 'visibilityState');

    reg = new FakeServiceWorkerRegistration();
    swContainer = new FakeServiceWorkerContainer(reg);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: swContainer,
      configurable: true,
    });
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });

    pwaMockState.registration = reg as unknown as ServiceWorkerRegistration;
    pwaMockState.onNeedReload = undefined;
    pwaMockState.setNeedRefresh = null;
    pwaMockState.autoRegister = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';

    if (originalSwDesc) {
      Object.defineProperty(navigator, 'serviceWorker', originalSwDesc);
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }

    if (originalOnLineDesc) {
      Object.defineProperty(navigator, 'onLine', originalOnLineDesc);
    } else {
      Reflect.deleteProperty(navigator, 'onLine');
    }

    if (originalVisibilityDesc) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityDesc);
    } else {
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('activates a waiting worker on Refresh and reloads once on controllerchange', async () => {
    const activeSw = new FakeServiceWorker('activated');
    const waitingSw = new FakeServiceWorker('installed');
    swContainer.controller = activeSw;
    reg.active = activeSw;
    reg.waiting = waitingSw;

    const onReload = vi.fn();
    const view = mount(<PwaUpdatePrompt onReload={onReload} isDev={false} />);

    expect(view.container.textContent).toContain('Update available');
    const refreshBtn = findButton(view.container, 'Refresh')!;
    expect(refreshBtn).toBeTruthy();

    await act(async () => {
      refreshBtn.click();
      await Promise.resolve();
    });

    expect(view.container.textContent).toContain('Applying update...');
    expect(waitingSw.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(onReload).not.toHaveBeenCalled();

    act(() => {
      reg.waiting = null;
      reg.active = waitingSw;
      swContainer.dispatchControllerChange(waitingSw);
    });

    expect(onReload).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('ignores first-visit initial claim but prompts and reloads on a subsequent update', async () => {
    const initialSw = new FakeServiceWorker('installing');
    swContainer.controller = null;
    reg.active = null;
    reg.installing = initialSw;

    const onReload = vi.fn();
    const view = mount(<PwaUpdatePrompt onReload={onReload} isDev={false} />);

    expect(view.container.textContent).toBe('');

    act(() => {
      reg.installing = null;
      reg.waiting = initialSw;
      initialSw.setState('installed');
    });
    expect(view.container.textContent).toBe('');

    act(() => {
      reg.waiting = null;
      reg.active = initialSw;
      initialSw.setState('activated');
      swContainer.dispatchControllerChange(initialSw);
    });
    expect(onReload).not.toHaveBeenCalled();

    const nextSw = new FakeServiceWorker('installing');
    act(() => {
      reg.installing = nextSw;
      reg.dispatchEvent(new Event('updatefound'));
    });

    act(() => {
      reg.installing = null;
      reg.waiting = nextSw;
      nextSw.setState('installed');
    });

    expect(view.container.textContent).toContain('Update available');

    await act(async () => {
      findButton(view.container, 'Refresh')!.click();
      await Promise.resolve();
    });

    expect(nextSw.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    act(() => {
      reg.waiting = null;
      reg.active = nextSw;
      swContainer.dispatchControllerChange(nextSw);
    });

    expect(onReload).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('reloads on hard-reloaded pages (controller === null, reg.active present) on Refresh and external controllerchange', async () => {
    const activeSw = new FakeServiceWorker('activated');
    const waitingSw = new FakeServiceWorker('installed');
    swContainer.controller = null;
    reg.active = activeSw;
    reg.waiting = waitingSw;

    const onReloadA = vi.fn();
    const viewA = mount(<PwaUpdatePrompt onReload={onReloadA} isDev={false} />);
    expect(viewA.container.textContent).toContain('Update available');

    await act(async () => {
      findButton(viewA.container, 'Refresh')!.click();
      await Promise.resolve();
    });
    expect(waitingSw.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    act(() => {
      swContainer.dispatchControllerChange(waitingSw);
    });
    expect(onReloadA).toHaveBeenCalledTimes(1);
    viewA.unmount();

    const waitingSwB = new FakeServiceWorker('installed');
    swContainer.controller = null;
    reg.active = activeSw;
    reg.waiting = waitingSwB;

    const onReloadB = vi.fn();
    const viewB = mount(<PwaUpdatePrompt onReload={onReloadB} isDev={false} />);
    expect(viewB.container.textContent).toContain('Update available');

    act(() => {
      reg.waiting = null;
      reg.active = waitingSwB;
      swContainer.dispatchControllerChange(waitingSwB);
    });
    expect(onReloadB).toHaveBeenCalledTimes(1);
    viewB.unmount();
  });

  it('reloads directly when Refresh is clicked after reg.waiting is already null', async () => {
    const activeSw = new FakeServiceWorker('activated');
    swContainer.controller = activeSw;
    reg.active = activeSw;
    reg.waiting = null;
    reg.installing = null;

    const onReload = vi.fn();
    const view = mount(<PwaUpdatePrompt onReload={onReload} isDev={false} />);

    act(() => {
      pwaMockState.setNeedRefresh?.(true);
    });
    expect(view.container.textContent).toContain('Update available');

    await act(async () => {
      findButton(view.container, 'Refresh')!.click();
      await Promise.resolve();
    });

    expect(swContainer.getRegistration).toHaveBeenCalledTimes(1);
    expect(onReload).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('watches reg.installing if waiting worker was replaced before Refresh is clicked', async () => {
    const activeSw = new FakeServiceWorker('activated');
    const waitingSw = new FakeServiceWorker('installed');
    swContainer.controller = activeSw;
    reg.active = activeSw;
    reg.waiting = waitingSw;

    const onReload = vi.fn();
    const view = mount(<PwaUpdatePrompt onReload={onReload} isDev={false} />);
    expect(view.container.textContent).toContain('Update available');

    const newerSw = new FakeServiceWorker('installing');
    reg.waiting = null;
    reg.installing = newerSw;

    await act(async () => {
      findButton(view.container, 'Refresh')!.click();
      await Promise.resolve();
    });

    expect(view.container.textContent).toContain('Downloading update...');
    expect(onReload).not.toHaveBeenCalled();

    act(() => {
      reg.installing = null;
      reg.waiting = newerSw;
      newerSw.setState('installed');
    });

    expect(view.container.textContent).toContain('Applying update...');
    expect(newerSw.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    act(() => {
      reg.waiting = null;
      reg.active = newerSw;
      newerSw.setState('activated');
    });

    expect(onReload).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('falls back to reloading when controllerchange does not fire', async () => {
    // Subcase A: waiting worker transitions to activated directly
    const activeSw = new FakeServiceWorker('activated');
    const waitingSwA = new FakeServiceWorker('installed');
    swContainer.controller = activeSw;
    reg.active = activeSw;
    reg.waiting = waitingSwA;

    const onReloadA = vi.fn();
    const viewA = mount(<PwaUpdatePrompt onReload={onReloadA} isDev={false} />);

    await act(async () => {
      findButton(viewA.container, 'Refresh')!.click();
      await Promise.resolve();
    });

    act(() => {
      waitingSwA.setState('activated');
    });
    expect(onReloadA).toHaveBeenCalledTimes(1);
    viewA.unmount();

    // Subcase B: fallback timer reloads after 2000ms if neither controllerchange nor statechange fires
    const waitingSwB = new FakeServiceWorker('installed');
    reg.waiting = waitingSwB;

    const onReloadB = vi.fn();
    const viewB = mount(<PwaUpdatePrompt onReload={onReloadB} isDev={false} />);

    await act(async () => {
      findButton(viewB.container, 'Refresh')!.click();
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(onReloadB).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onReloadB).toHaveBeenCalledTimes(1);
    viewB.unmount();
  });

  it('invokes onReload only once even when multiple reload signals fire', async () => {
    const activeSw = new FakeServiceWorker('activated');
    const waitingSw = new FakeServiceWorker('installed');
    swContainer.controller = activeSw;
    reg.active = activeSw;
    reg.waiting = waitingSw;

    const onReload = vi.fn();
    const view = mount(<PwaUpdatePrompt onReload={onReload} isDev={false} />);

    await act(async () => {
      findButton(view.container, 'Refresh')!.click();
      await Promise.resolve();
    });

    act(() => {
      pwaMockState.onNeedReload?.();
      swContainer.dispatchControllerChange(waitingSw);
      waitingSw.setState('activated');
      vi.advanceTimersByTime(5000);
    });

    expect(onReload).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('stays dismissed for the same worker across visibility/focus checks, then re-prompts on a newer update', () => {
    const activeSw = new FakeServiceWorker('activated');
    const worker1 = new FakeServiceWorker('installed');
    swContainer.controller = activeSw;
    reg.active = activeSw;
    reg.waiting = worker1;

    const onReload = vi.fn();
    const view = mount(<PwaUpdatePrompt onReload={onReload} isDev={false} />);
    expect(view.container.textContent).toContain('Update available');

    const dismissBtn = view.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss update notification"]'
    )!;
    act(() => {
      dismissBtn.click();
    });
    expect(view.container.textContent).toBe('');

    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(view.container.textContent).toBe('');

    const worker2 = new FakeServiceWorker('installing');
    act(() => {
      reg.installing = worker2;
      reg.dispatchEvent(new Event('updatefound'));
    });

    act(() => {
      reg.installing = null;
      reg.waiting = worker2;
      worker2.setState('installed');
    });

    expect(view.container.textContent).toContain('Update available');
    view.unmount();
  });

  it('handles manual triggerAppUpdate() for waiting, failing installing, and up-to-date states', async () => {
    const activeSw = new FakeServiceWorker('activated');
    const waitingSw = new FakeServiceWorker('installed');
    swContainer.controller = activeSw;
    reg.active = activeSw;
    reg.waiting = waitingSw;

    // 1) Waiting worker present -> applies immediately and reloads on controllerchange
    const onReload1 = vi.fn();
    const view1 = mount(<PwaUpdatePrompt onReload={onReload1} isDev={false} />);

    await act(async () => {
      triggerAppUpdate();
      await Promise.resolve();
    });

    expect(view1.container.textContent).toContain('Applying update...');
    expect(waitingSw.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

    act(() => {
      swContainer.dispatchControllerChange(waitingSw);
    });
    expect(onReload1).toHaveBeenCalledTimes(1);
    view1.unmount();

    // 2) Installing worker becomes redundant -> reports 'Update failed'
    const installingSw = new FakeServiceWorker('installing');
    reg.waiting = null;
    reg.installing = installingSw;

    const onReload2 = vi.fn();
    const view2 = mount(<PwaUpdatePrompt onReload={onReload2} isDev={false} />);

    await act(async () => {
      triggerAppUpdate();
      await Promise.resolve();
    });
    expect(view2.container.textContent).toContain('Downloading update...');

    act(() => {
      reg.installing = null;
      installingSw.setState('redundant');
    });
    expect(view2.container.textContent).toContain('Update failed');
    expect(onReload2).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(view2.container.textContent).toBe('');
    view2.unmount();

    // 3) No update available -> checks and reports 'App is up to date'
    reg.waiting = null;
    reg.installing = null;

    const onReload3 = vi.fn();
    const view3 = mount(<PwaUpdatePrompt onReload={onReload3} isDev={false} />);
    reg.update.mockClear();

    await act(async () => {
      triggerAppUpdate();
      await Promise.resolve();
    });

    expect(reg.update).toHaveBeenCalledTimes(1);
    expect(view3.container.textContent).toContain('Checking for updates...');

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(view3.container.textContent).toContain('App is up to date');

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(view3.container.textContent).toBe('');
    expect(onReload3).not.toHaveBeenCalled();
    view3.unmount();
  });
});
