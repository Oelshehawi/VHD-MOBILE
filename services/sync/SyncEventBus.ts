export interface BusinessRejectEvent {
  type: 'business_reject';
  table: string;
  id?: string;
  message: string;
}

export type SyncEvent = BusinessRejectEvent;

type Listener = (event: SyncEvent) => void;

const listeners = new Set<Listener>();

export const SyncEventBus = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  emit(event: SyncEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors so one bad subscriber can't break others.
      }
    }
  }
};

export class BusinessRejectError extends Error {
  readonly table: string;
  readonly id?: string;
  readonly serverMessage: string;

  constructor(args: { table: string; id?: string; serverMessage: string }) {
    super(`Business reject for ${args.table}${args.id ? `:${args.id}` : ''}: ${args.serverMessage}`);
    this.name = 'BusinessRejectError';
    this.table = args.table;
    this.id = args.id;
    this.serverMessage = args.serverMessage;
  }
}
