export function createBus() {
  const t = new EventTarget();
  return {
    on: (type, fn) => t.addEventListener(type, e => fn(e.detail)),
    emit: (type, detail) => t.dispatchEvent(new CustomEvent(type, { detail })),
  };
}
