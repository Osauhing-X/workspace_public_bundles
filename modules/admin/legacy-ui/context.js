import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';

export const admin_tab = writable('overview');
export const mail_draft = writable(null);
export const admin_filter = writable({ email: '', projekt: '', arve: '', ettevote: '' });

export function openMailDraft(draft = {}) {
  mail_draft.set({
    to: draft.to || '',
    subject: draft.subject || '',
    text: draft.text || '',
    source: draft.source || null
  });
  openAdminTab('resend');
}

function normalizeFilter(filter = {}) {
  return {
    email: filter.email || '',
    projekt: filter.projekt || filter.project || '',
    arve: filter.arve || filter.invoice || '',
    ettevote: filter.ettevote || filter.company || filter.company_id || ''
  };
}

export function openAdminTab(tab, filter = {}) {
  const nextFilter = normalizeFilter(filter);
  admin_filter.set(nextFilter);
  admin_tab.set(tab);

  if (browser) {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);

    for (const key of ['email', 'projekt', 'arve', 'ettevote']) {
      if (nextFilter[key]) url.searchParams.set(key, nextFilter[key]);
      else url.searchParams.delete(key);
    }

    goto(`${url.pathname}${url.search ? url.search : ''}`, {
      replaceState: false,
      noScroll: true,
      keepFocus: true
    });
  }
}
