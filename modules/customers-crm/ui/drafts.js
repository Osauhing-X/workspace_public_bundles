// Module data is JSON; serialization also removes Svelte's reactive proxies.
export function cloneDraft(value) {
  return JSON.parse(JSON.stringify(value));
}
