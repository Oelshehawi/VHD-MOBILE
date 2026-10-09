export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ToastState {
  toast: ToastMessage | null;
  /** Only the top-most viewport renders, so toasts appear above nested native Modals. */
  topViewportId: number | null;
}

const DEFAULT_DURATION_MS = 3500;

let state: ToastState = { toast: null, topViewportId: null };
let viewportStack: number[] = [];
let nextId = 1;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function setState(next: Partial<ToastState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export const toastBus = {
  show(message: string, options: { tone?: ToastTone; durationMs?: number } = {}): number {
    const id = nextId++;
    setState({ toast: { id, message, tone: options.tone ?? 'success' } });

    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(() => toastBus.dismiss(id), options.durationMs ?? DEFAULT_DURATION_MS);
    return id;
  },

  dismiss(id?: number) {
    if (id !== undefined && state.toast?.id !== id) return;
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = null;
    setState({ toast: null });
  },

  /** Pushes a viewport onto the stack; call the returned function on unmount. */
  registerViewport(): { id: number; unregister: () => void } {
    const id = nextId++;
    viewportStack = [...viewportStack, id];
    setState({ topViewportId: id });

    return {
      id,
      unregister: () => {
        viewportStack = viewportStack.filter((entry) => entry !== id);
        setState({ topViewportId: viewportStack[viewportStack.length - 1] ?? null });
      }
    };
  },

  hasViewport(): boolean {
    return viewportStack.length > 0;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getState(): ToastState {
    return state;
  }
};
