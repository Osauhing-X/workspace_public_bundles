const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
export function render({ payload }) {
  const value = payload.publication;
  if (!value) return '<p>No Discord messages have been selected for publication.</p>';
  return `<section class="box _outer grid gap _2"><h2>${escape(value.title)}</h2><p>Selected community updates</p>${value.messages.map(message => `<article class="box"><p style="white-space:pre-wrap">${escape(message.content)}</p><time>${escape(message.timestamp)}</time></article>`).join('')}</section>`;
}
