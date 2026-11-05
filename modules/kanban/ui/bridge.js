let sequence = 0;
const pending = new Map();
window.addEventListener('message', event => {
  if (event.source !== parent || event.data?.type !== 'workspace:response') return;
  const callback = pending.get(event.data.id);
  if (!callback) return;
  pending.delete(event.data.id); clearTimeout(callback.timer);
  callback.resolve({ ok: event.data.status >= 200 && event.data.status < 300, json: async () => event.data.result });
});
export function moduleRequest(_url, options = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Core did not respond.')); }, 20000);
    pending.set(id, { resolve, timer });
    parent.postMessage({ type: 'workspace:request', id, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined }, '*');
  });
}
