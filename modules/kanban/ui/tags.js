export const tagKey = value => value.normalize('NFC').trim().toLowerCase();

export function parseTagInput(value) {
  const parts = String(value ?? '').split(',').map(tag => tag.trim()).filter(Boolean);
  if (parts.length > 20) throw Error('Use at most 20 labels per task.');
  const seen = new Set(), tags = [];
  for (const part of parts) {
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(part) || [...part.normalize('NFC')].length > 32) throw Error('Each label must contain 1 to 32 characters on one line.');
    const tag = part.normalize('NFC'), key = tagKey(tag);
    if (!seen.has(key)) { seen.add(key); tags.push(tag); }
  }
  return tags;
}

export function taskMatches(card, query = '', label = '') {
  if (label && !(card.tags ?? []).some(tag => tagKey(tag) === label)) return false;
  const needle = query.trim().toLowerCase();
  return !needle || [card.id,card.id==null?'':'#'+card.id,card.title, card.description, ...(card.tags ?? [])].some(value => String(value ?? '').toLowerCase().includes(needle));
}
