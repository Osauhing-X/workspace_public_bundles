let sequence = 0;
const pending = new Map();
window.addEventListener('message', event => { if (event.source !== parent || event.data?.type !== 'workspace:response') return; const request = pending.get(event.data.id); if (!request) return; pending.delete(event.data.id); clearTimeout(request.timer); request.resolve({ ok: event.data.status >= 200 && event.data.status < 300, json: async () => event.data.result }); });
export function moduleRequest(body) {
  return new Promise((resolve, reject) => {
    // Svelte drafts may be deep proxies. The Core bridge accepts JSON only.
    const snapshot = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Core did not respond. Your edits were preserved.')); }, 30000);
    pending.set(id, { resolve, timer });
    try { parent.postMessage({ type: 'workspace:request', id, method: body ? 'POST' : 'GET', body: snapshot }, '*'); }
    catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
  });
}
