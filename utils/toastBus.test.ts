import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { toastBus } from './toastBus';

describe('toast viewport stack', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => {
    cleanups.splice(0).forEach((unregister) => unregister());
    toastBus.dismiss();
    jest.useRealTimers();
  });

  function register() {
    const viewport = toastBus.registerViewport();
    cleanups.push(viewport.unregister);
    return viewport;
  }

  it('makes the most recently mounted viewport the only one that renders', () => {
    const root = register();
    const modal = register();
    const camera = register();

    expect(toastBus.getState().topViewportId).toBe(camera.id);

    camera.unregister();
    expect(toastBus.getState().topViewportId).toBe(modal.id);

    modal.unregister();
    expect(toastBus.getState().topViewportId).toBe(root.id);
  });

  it('keeps an active toast when its viewport closes so the one below shows it', () => {
    register();
    const modal = register();
    toastBus.show('Added 3 photos');

    modal.unregister();

    expect(toastBus.getState().toast?.message).toBe('Added 3 photos');
  });

  it('auto-dismisses and lets a newer toast replace the old one', () => {
    register();
    const listener = jest.fn();
    cleanups.push(toastBus.subscribe(listener));

    toastBus.show('first', { durationMs: 1000 });
    toastBus.show('second', { durationMs: 1000, tone: 'error' });
    expect(toastBus.getState().toast).toMatchObject({ message: 'second', tone: 'error' });

    jest.advanceTimersByTime(1000);
    expect(toastBus.getState().toast).toBeNull();
    expect(listener).toHaveBeenCalled();
  });

  it('ignores a stale dismiss for a toast that was already replaced', () => {
    register();
    const first = toastBus.show('first');
    toastBus.show('second');

    toastBus.dismiss(first);

    expect(toastBus.getState().toast?.message).toBe('second');
  });
});
