// Pequeno helper de observable/pub-sub reutilizado por core/app-state.js e core/i18n.js.
export function createObservable(initialValue) {
  let value = initialValue;
  const listeners = new Set();

  return {
    get() {
      return value;
    },
    set(next) {
      value = next;
      for (const listener of listeners) listener(value);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
