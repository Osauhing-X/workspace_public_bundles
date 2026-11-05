<svelte:options runes={false} />
<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { admin_filter, openAdminTab } from './context.js';
  import { formatDate } from '$lib/assets/scripts/helpers';
  import { formatInvoiceNumber, invoiceDue } from '$lib/paths/invoice.js';
  import Popover from '$lib/components/popover.svelte';
  import Income_SVG from './income_svg.svelte';
  import StripeInvoiceTable from './stripe_invoice_table.svelte';

  export let data = null;
  $: adminData = { ...($page.data || {}), ...(data || {}) };

  let invoices = [];
  let stripeInvoices = [];
  let projects = [];
  let companies = [];
  let search = get(admin_filter).email || get(admin_filter).arve || '';
  let projectFilter = get(admin_filter).projekt || '';
  let editing = get(admin_filter).arve || null;
  let saving = false;
  let stripeBusy = {};
  let sortNewestFirst = true;
  let openStripeInvoice = '';
  let invoiceTemplatesFromStripe = [];
  let draft = {
    customer_key: '',
    email: get(admin_filter).email || '',
    ettevote_id: '',
    projekt_id: get(admin_filter).projekt || '',
    template: 'service',
    rendering_template: '',
    note: ''
  };
  let draftProduct = '';
  let draftCustom = { description: '', quantity: 1, amount: 0 };
  let draftItems = [];
  const invoiceTemplates = [
    { id: 'service', label: 'Teenuse arve', memo: 'Teenuse osutamine ja seotud tööde ülevaade.' },
    { id: 'project', label: 'Projekti töö', memo: 'Projekti raames tehtud tööde ja materjalide kokkuvõte.' },
    { id: 'subscription', label: 'Korduv teenus', memo: 'Korduva teenuse perioodiline arve.' },
    { id: 'custom', label: 'Custom', memo: '' }
  ];

  $: invoices = adminData.arve_data || [];
  $: stripeInvoices = Array.isArray(adminData.stripe_data?.invoices) ? adminData.stripe_data.invoices : [];
  $: stripeProducts = Array.isArray(adminData.stripe_data?.products) ? adminData.stripe_data.products : [];
  $: stripePrices = Array.isArray(adminData.stripe_data?.prices) ? adminData.stripe_data.prices : [];
  $: stripeTransactions = Array.isArray(adminData.stripe_data?.invoice_transactions)
    ? adminData.stripe_data.invoice_transactions
    : (Array.isArray(adminData.stripe_data?.transactions) ? adminData.stripe_data.transactions : []);
  $: workLogs = Array.isArray(adminData.work_logs_data) ? adminData.work_logs_data : [];
  $: workspaceUsers = Array.isArray(adminData.customer_users_data?.users) ? adminData.customer_users_data.users : [];
  $: staffUsers = Array.isArray(adminData.users_data?.users) ? adminData.users_data.users : [];
  $: stripeCustomers = Array.isArray(adminData.stripe_data?.customers) ? adminData.stripe_data.customers : [];
  $: projects = adminData.projekt_data || [];
  $: companies = adminData.ettevote_data || [];
  $: invoiceCustomers = buildInvoiceCustomers();
  $: productPriceOptions = buildProductPriceOptions();
  $: draftPreviewTotal = draftItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  onMount(async () => {
    const response = await fetch('/@_api/admin/stripe?resource=invoice_templates');
    const body = await response.json().catch(() => ({}));
    if (response.ok) invoiceTemplatesFromStripe = body.templates || [];
  });
  $: rows = invoices
    .filter(invoice => {
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        String(invoice.arve_nr || '').toLowerCase().includes(q) ||
        formatInvoiceNumber(invoice).toLowerCase().includes(q) ||
        String(invoice.email || '').toLowerCase().includes(q) ||
        String(company(invoice)?.name || '').toLowerCase().includes(q);
      const matchesProject = !projectFilter || invoice.projekt_id === projectFilter;
      return matchesSearch && matchesProject;
    })
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  function company(invoice) {
    return companies.find(item => item.id === invoice.ettevote_id);
  }

  function project(invoice) {
    return projects.find(item => item.id === invoice.projekt_id);
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function stripeId(row = {}) {
    return row.id || row.customer || row.object?.id || row.object?.customer || '';
  }

  function rememberCustomer(map, key, row) {
    if (!key || map.has(key)) return;
    map.set(key, row);
  }

  function buildInvoiceCustomers() {
    const map = new Map();

    for (const company of companies) {
      const email = normalizeEmail(company.primary_email || company.email);
      const row = {
        key: `company:${company.id}`,
        label: company.name || email || company.id,
        email,
        ettevote_id: company.id,
        source: 'Company'
      };
      rememberCustomer(map, row.key, row);
      if (email) rememberCustomer(map, `email:${email}`, row);
    }

    for (const user of workspaceUsers) {
      const email = normalizeEmail(user.email);
      const row = {
        key: `workspace:${user.id}`,
        label: user.user_metadata?.full_name || user.email || user.id,
        email,
        source: 'Workspace'
      };
      rememberCustomer(map, row.key, row);
      if (email) rememberCustomer(map, `email:${email}`, row);
    }

    for (const user of staffUsers) {
      const email = normalizeEmail(user.email);
      const row = {
        key: `staff:${user.id}`,
        label: user.user_metadata?.full_name || user.email || user.id,
        email,
        source: 'Staff'
      };
      rememberCustomer(map, row.key, row);
      if (email) rememberCustomer(map, `email:${email}`, row);
    }

    for (const customer of stripeCustomers) {
      const email = normalizeEmail(customer.email);
      const id = stripeId(customer);
      const row = {
        key: `stripe:${id || email}`,
        label: customer.name || customer.email || id,
        email,
        stripe_customer_id: id,
        source: 'Stripe'
      };
      rememberCustomer(map, row.key, row);
      if (email) rememberCustomer(map, `email:${email}`, row);
    }

    const seenKeys = new Set();
    const seenEmails = new Set();
    return [...map.values()].filter((row) => {
      if (!row.key || seenKeys.has(row.key)) return false;
      const email = normalizeEmail(row.email);
      if (email && seenEmails.has(email)) return false;
      seenKeys.add(row.key);
      if (email) seenEmails.add(email);
      return true;
    });
  }

  function selectedCustomer() {
    return invoiceCustomers.find((item) => item.key === draft.customer_key) ||
      invoiceCustomers.find((item) => normalizeEmail(item.email) === normalizeEmail(draft.email)) ||
      null;
  }

  function productId(product = {}) {
    return product.id || product.object?.id || '';
  }

  function productName(product = {}) {
    return product.name || product.object?.name || productId(product) || 'Product';
  }

  function priceProductId(price = {}) {
    const product = price.product ?? price.object?.product ?? price.metadata?.product;
    return typeof product === 'string' ? product : product?.id || '';
  }

  function buildProductPriceOptions() {
    return stripePrices.map((price) => {
      const product = stripeProducts.find((item) => productId(item) === priceProductId(price));
      const amount = Number(price.amount || price.unit_amount || 0);
      const recurring = price.object?.recurring?.interval ? ` / ${price.object.recurring.interval}` : '';
      return {
        key: price.id,
        price,
        product,
        label: `${productName(product)} - ${stripeMoney(amount, price.currency)}${recurring}`
      };
    });
  }

  function blankLine(extra = {}) {
    return { date: new Date().toISOString().slice(0, 16), what: 'ungrouped', description: '', worker_email: '', hours: 1, hourly_rate: 0, amount: 0, ...extra };
  }

  function addDraftProduct() {
    const option = productPriceOptions.find((item) => item.key === draftProduct);
    if (!option) return;
    const amount = Number(option.price.amount || option.price.unit_amount || 0) / 100;
    draftItems = [
      ...draftItems,
      blankLine({
        what: 'stripe_product',
        description: productName(option.product),
        stripe_product_id: productId(option.product),
        stripe_price_id: option.price.id,
        hourly_rate: amount,
        amount
      })
    ];
    draftProduct = '';
  }

  function selectedTemplate() {
    return invoiceTemplates.find((item) => item.id === draft.template) || invoiceTemplates[0];
  }

  function resetDraft() {
    draft = {
      customer_key: '',
      email: get(admin_filter).email || '',
      ettevote_id: '',
      projekt_id: get(admin_filter).projekt || '',
      template: 'service',
      rendering_template: '',
      note: ''
    };
    draftProduct = '';
    draftCustom = { description: '', quantity: 1, amount: 0 };
    draftItems = [];
  }

  function cancelDraft() {
    resetDraft();
    document.getElementById('invoice_create')?.hidePopover?.();
  }

  function addDraftCustom() {
    if (!draftCustom.description.trim()) return;
    const quantity = Number(draftCustom.quantity || 1);
    const unit = Number(draftCustom.amount || 0);
    draftItems = [
      ...draftItems,
      blankLine({
        what: 'custom',
        description: draftCustom.description.trim(),
        hours: quantity,
        hourly_rate: unit,
        amount: Number((quantity * unit).toFixed(3)),
        add_to_product_catalog: false
      })
    ];
    draftCustom = { description: '', quantity: 1, amount: 0 };
  }

  function removeDraftLine(index) {
    draftItems = draftItems.filter((_, itemIndex) => itemIndex !== index);
  }

  function workLogHours(row = {}) {
    const explicit = Number(row.duration_hours ?? row.hours);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const start = new Date(row.started_at || 0).getTime();
    const stop = new Date(row.stopped_at || 0).getTime();
    return Number.isFinite(start) && Number.isFinite(stop) && stop > start
      ? Number(((stop - start) / 3600000).toFixed(2))
      : 0;
  }

  function availableProjects(invoice = {}) {
    const current = invoice.metadata?.project_id || invoice.object?.metadata?.project_id || '';
    const linked = new Set([
      ...stripeInvoices
        .filter((item) => item.id !== invoice.id)
        .map((item) => item.metadata?.project_id || item.object?.metadata?.project_id),
      ...invoices.map((item) => item.projekt_id || item.project_id)
    ].filter(Boolean));
    return projects.filter((project) => project.id === current || !linked.has(project.id));
  }

  function availableWorkLogs(invoice = {}) {
    return workLogs.filter((row) => {
      const linked = String(row.metadata?.invoice_id || row.invoice_id || '').trim();
      return row.stopped_at && (!linked || linked === invoice.id);
    });
  }

  async function attachDraftRelations(invoice, projectId, workLogIds) {
    stripeBusy[invoice.id] = true;
    stripeBusy = { ...stripeBusy };
    const response = await fetch('/@_api/admin/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'attach_invoice_work',
        invoice: invoice.id,
        project_id: projectId || '',
        work_log_ids: workLogIds
      })
    });
    const body = await response.json().catch(() => ({}));
    stripeBusy[invoice.id] = false;
    stripeBusy = { ...stripeBusy };
    if (!response.ok) {
      alert(body.error || 'Projekti ja tehtud tööde seostamine ebaõnnestus.');
      return false;
    }
    stripeInvoices = stripeInvoices.map((row) => row.id === invoice.id
      ? { ...row, metadata: body.invoice?.metadata || row.metadata, object: body.invoice || row.object }
      : row);
    workLogs = workLogs.map((row) => workLogIds.includes(row.id)
      ? { ...row, metadata: { ...(row.metadata || {}), invoice_id: invoice.id } }
      : row);
    return true;
  }

  async function updateDraftInvoice(invoice, draft) {
    stripeBusy[invoice.id] = true; stripeBusy = { ...stripeBusy };
    const response = await fetch('/@_api/admin/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_draft_invoice', invoice: invoice.id, ...draft }) });
    const body = await response.json().catch(() => ({}));
    stripeBusy[invoice.id] = false; stripeBusy = { ...stripeBusy };
    if (!response.ok) { alert(body.error || 'Draft-arve muutmine ebaõnnestus.'); return false; }
    stripeInvoices = stripeInvoices.map((row) => row.id === invoice.id ? { ...row, email: body.invoice.customer_email || draft.email, amount: body.invoice.total, amount_due: body.invoice.amount_due, metadata: body.invoice.metadata, object: body.invoice } : row);
    return true;
  }

  async function cancelDraftInvoice(invoice) {
    if (!confirm(`Tühista ja kustuta saatmata draft-arve ${invoice.number || invoice.id}?`)) return false;
    stripeBusy[invoice.id] = true; stripeBusy = { ...stripeBusy };
    const response = await fetch('/@_api/admin/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel_draft_invoice', invoice: invoice.id }) });
    const body = await response.json().catch(() => ({}));
    stripeBusy[invoice.id] = false; stripeBusy = { ...stripeBusy };
    if (!response.ok) { alert(body.error || 'Draft-arve tühistamine ebaõnnestus.'); return false; }
    stripeInvoices = stripeInvoices.filter((row) => row.id !== invoice.id);
    openStripeInvoice = '';
    return true;
  }

  function dateValue(value) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number > 9999999999 ? number : number * 1000;
    const parsed = new Date(value || 0).getTime();
    return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
  }

  function dueDate(invoice) {
    const explicit = invoice.due_date ?? invoice.object?.due_date ?? invoice.kuupaev;
    const base = new Date(dateValue(explicit || invoice.created_at || Date.now()));
    if (!explicit) base.setDate(base.getDate() + 10);
    return base;
  }

  function isStripePaid(invoice = {}) {
    return String(invoice.status || '').toLowerCase() === 'paid' || Number(invoice.amount_remaining ?? invoice.object?.amount_remaining ?? 0) === 0 && Number(invoice.amount_paid ?? invoice.object?.amount_paid ?? 0) > 0;
  }

  function isOverdue(invoice = {}) {
    return !isStripePaid(invoice) && dueDate(invoice).getTime() < Date.now();
  }

  function lateDays(invoice) {
    return Math.max(0, Math.floor((Date.now() - dueDate(invoice).getTime()) / 86400000));
  }

  function lateFee(invoice) {
    const due = invoiceDue(invoice);
    return due > 0 && lateDays(invoice) > 0 ? Number((due * 0.005 * lateDays(invoice)).toFixed(3)) : 0;
  }

  function syncAmount(item, key, value) {
    item[key] = value;
    const hours = Number(item.hours || 0);
    const rate = Number(item.hourly_rate || 0);
    if (hours > 0 && rate > 0) item.amount = Number(((item.is_payment ? -1 : 1) * hours * rate).toFixed(3));
    invoices = [...invoices];
  }

  function stripeMoney(cents, currency = 'eur') {
    const value = Number(cents ?? 0);
    return `${(value / 100).toFixed(2)} ${String(currency || 'eur').toUpperCase()}`;
  }

  function canApplyStripeLateFee(invoice = {}) {
    return String(invoice.id || '').startsWith('in_') &&
      ['draft', 'open', 'uncollectible'].includes(String(invoice.status || '').toLowerCase()) &&
      Number(invoice.amount_remaining ?? invoice.amount_due ?? invoice.total ?? invoice.amount ?? 0) > 0;
  }

  function stripePdf(invoice = {}) {
    return invoice.invoice_pdf || invoice.object?.invoice_pdf || '';
  }

  function invoicePaymentPage(invoice = {}) {
    return `/info?what=payment&id=${encodeURIComponent(invoice.id || invoice.number || '')}`;
  }

  $: stripeRows = stripeInvoices
    .filter(invoice => {
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        String(invoice.id || '').toLowerCase().includes(q) ||
        String(invoice.number || '').toLowerCase().includes(q) ||
        String(invoice.email || '').toLowerCase().includes(q) ||
        String(invoice.customer || '').toLowerCase().includes(q) ||
        String(invoice.status || '').toLowerCase().includes(q);
      const metadata = invoice.metadata || invoice.object?.metadata || {};
      return matchesSearch && (!projectFilter || metadata.project_id === projectFilter);
    })
    .sort((a, b) => (dateValue(b.created_at) - dateValue(a.created_at)) * (sortNewestFirst ? 1 : -1));
  $: unpaidStripeRows = stripeRows.filter((invoice) => !isStripePaid(invoice));
  $: paidStripeRows = stripeRows.filter(isStripePaid);
  $: stripeChartMonths = buildStripeChartMonths(stripeRows);

  function buildStripeChartMonths(items = []) {
    const months = new Map();
    for (const invoice of items) {
      const date = new Date(dateValue(invoice.created_at));
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const current = months.get(key) || { income: 0, billed: 0, items: [] };
      const cents = Number(isStripePaid(invoice)
        ? (invoice.amount_paid ?? invoice.object?.amount_paid ?? invoice.amount ?? 0)
        : (invoice.amount_remaining ?? invoice.object?.amount_remaining ?? invoice.amount_due ?? invoice.amount ?? 0));
      if (isStripePaid(invoice)) current.income += Math.abs(cents) / 100;
      else current.billed += Math.abs(cents) / 100;
      current.items.push(invoice);
      months.set(key, current);
    }
    return [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  function invoiceTransactions(invoice = {}) {
    const invoiceId = String(invoice.id || '');
    const paymentIntent = String(invoice.payment_intent || invoice.object?.payment_intent || '');
    return stripeTransactions.filter((row) => {
      const linkedInvoice = String(row.invoice || row.object?.invoice || row.metadata?.invoice_id || '');
      const linkedIntent = String(row.payment_intent || row.object?.payment_intent || '');
      return linkedInvoice === invoiceId || (paymentIntent && linkedIntent === paymentIntent);
    });
  }

  function invoiceWorkLogs(invoice = {}) {
    return workLogs.filter((row) => String(row.metadata?.invoice_id || row.invoice_id || '') === String(invoice.id || ''));
  }

  function toggleStripeInvoice(invoice) {
    openStripeInvoice = openStripeInvoice === invoice.id ? '' : invoice.id;
  }
  function paymentReference() {
    return `PAY-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }

  function togglePayment(item) {
    item.is_payment = !item.is_payment;
    item.what = item.is_payment ? 'payment' : 'ungrouped';
    item.description ||= item.is_payment ? 'Makse' : '';
    item.payment_reference ||= item.is_payment ? paymentReference() : '';
    item.amount = item.is_payment ? -Math.abs(Number(item.amount || 0)) : Math.abs(Number(item.amount || 0));
    invoices = [...invoices];
  }

  function setPaymentAmount(item, value) {
    item.amount = -Math.abs(Number(value || 0));
    invoices = [...invoices];
  }

  async function createInvoice() {
    const selectedProject = projects.find(item => item.id === draft.projekt_id);
    const customer = selectedCustomer();
    const selectedCompany = companies.find(item => item.id === draft.ettevote_id) ||
      companies.find(item => item.id === customer?.ettevote_id) ||
      companies.find(item => item.id === selectedProject?.ettevote_id);
    saving = true;
    const email = draft.email || customer?.email || selectedProject?.email || selectedCompany?.primary_email || '';
    const response = await fetch('/@_api/admin/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_invoice',
        email,
        stripe_customer_id: customer?.stripe_customer_id || null,
        lines: draftItems,
        note: draft.note || selectedTemplate()?.memo || '',
        rendering_template: draft.rendering_template || '',
        metadata: {
          invoice_template: draft.template || 'service',
          company_id: selectedCompany?.id || '',
          project_id: draft.projekt_id || ''
        }
      })
    });
    saving = false;
    const body = await response.json();
    if (!response.ok) return alert(body.error || 'Arve loomine ebaõnnestus.');
    const invoice = body.invoice;
    stripeInvoices = [{
      id: invoice.id,
      kind: 'invoice',
      number: invoice.number,
      email: invoice.customer_email || email,
      customer: invoice.customer,
      status: invoice.status,
      amount: invoice.total,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      amount_remaining: invoice.amount_remaining,
      currency: invoice.currency,
      created_at: invoice.created,
      due_date: invoice.due_date,
      url: invoice.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf,
      payment_intent: invoice.payment_intent,
      metadata: invoice.metadata || {},
      object: invoice
    }, ...stripeInvoices];
    openStripeInvoice = invoice.id;
    resetDraft();
    document.getElementById('invoice_create')?.hidePopover?.();
  }

  async function saveInvoice(invoice) {
    const response = await fetch('/@_api/admin/invoice', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoice)
    });
    const body = await response.json();
    if (!response.ok) return alert(body.error || 'Arve salvestamine ebaõnnestus.');
    invoices = invoices.map(item => item.arve_nr === invoice.arve_nr ? body : item);
    editing = null;
  }

  async function deleteInvoice(invoice) {
    if (!confirm(`Kustuta arve ${formatInvoiceNumber(invoice) || invoice.arve_nr}`)) return;
    const response = await fetch('/@_api/admin/invoice', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arve_nr: invoice.arve_nr })
    });
    if (!response.ok) return alert((await response.json()).error || 'Arve kustutamine ebaõnnestus.');
    invoices = invoices.filter(item => item.arve_nr !== invoice.arve_nr);
  }

  function addLine(invoice, line = null) {
    invoice.line_items = [
      ...(invoice.line_items || []),
      line || blankLine()
    ];
    invoices = [...invoices];
  }

  function removeLine(invoice, index) {
    invoice.line_items.splice(index, 1);
    invoice.line_items = [...invoice.line_items];
    invoices = [...invoices];
  }

  async function markCashPaid(invoice) {
    const due = invoiceDue(invoice);
    if (due <= 0) return;
    if (!confirm(`Märgi arve ${formatInvoiceNumber(invoice)} makstuks summas ${due} EUR`)) return;
    invoice.line_items = [
      ...(invoice.line_items || []),
      {
        date: new Date().toISOString().slice(0, 16),
        what: 'payment',
        description: 'Makstud käsitsi / sularahas',
        is_payment: true,
        payment_reference: paymentReference(),
        amount: -Math.abs(due)
      }
    ];
    await saveInvoice(invoice);
  }

  async function addLateFee(invoice) {
    const amount = lateFee(invoice);
    if (amount <= 0) return;
    invoice.line_items = [
      ...(invoice.line_items || []),
      {
        date: new Date().toISOString().slice(0, 16),
        what: 'late_fee',
        description: `Viivis ${lateDays(invoice)} päeva x 0.5%`,
        hours: 1,
        hourly_rate: amount,
        amount
      }
    ];
    await saveInvoice(invoice);
  }

  async function startTerminalPayment(invoice) {
    const due = invoiceDue(invoice);
    if (due <= 0) return;
    const response = await fetch('/@_api/admin/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'terminal_payment_intent',
        amount: due,
        currency: 'eur',
        invoice: formatInvoiceNumber(invoice) || invoice.arve_nr,
        project: invoice.projekt_id || ''
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return alert(body.error || 'Terminal makse alustamine ebaõnnestus.');
    alert(`Terminal PaymentIntent loodud: ${body.payment_intent.id}`);
  }

  async function addStripeLateFee(invoice) {
    if (!canApplyStripeLateFee(invoice)) return;
    if (!confirm(`Lisa Stripe arvele ${invoice.number || invoice.id} viivis 0.5% päevas`)) return;
    stripeBusy[invoice.id] = true;
    stripeBusy = { ...stripeBusy };
    const response = await fetch('/@_api/admin/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'apply_invoice_late_fee', invoice: invoice.id })
    });
    const body = await response.json().catch(() => ({}));
    stripeBusy[invoice.id] = false;
    stripeBusy = { ...stripeBusy };
    if (!response.ok) return alert(body.error || 'Stripe viivise lisamine ebaõnnestus.');
    alert(body.revision
      ? `Viivis lisatud Stripe revision draft arvele ${body.invoice?.id}. Vaata Stripe'is üle ja saada uuesti.`
      : `Viivis lisatud Stripe arvele ${body.invoice?.id}.`);
  }

  async function markStripeInvoicePaid(invoice) {
    if (!confirm(`Märgi Stripe’i arve ${invoice.number || invoice.id} väljaspool Stripe’i makstuks?`)) return;
    stripeBusy[invoice.id] = true;
    stripeBusy = { ...stripeBusy };
    const response = await fetch('/@_api/admin/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_invoice_paid', invoice: invoice.id })
    });
    const body = await response.json().catch(() => ({}));
    stripeBusy[invoice.id] = false;
    stripeBusy = { ...stripeBusy };
    if (!response.ok) return alert(body.error || 'Arve makstuks märkimine ebaõnnestus.');
    stripeInvoices = stripeInvoices.map((row) => row.id === invoice.id
      ? { ...row, status: 'paid', amount_paid: body.invoice?.amount_paid ?? row.amount_due, amount_remaining: 0, object: body.invoice ?? row.object }
      : row);
  }

  async function finalizeStripeInvoice(invoice, memo, renderingTemplate = '') {
    if (!confirm(`Finaliseeri Stripe’i draft-arve ${invoice.number || invoice.id}? Pärast finaliseerimist ei saa arve põhiandmeid vabalt muuta.`)) return;
    stripeBusy[invoice.id] = true;
    stripeBusy = { ...stripeBusy };
    const response = await fetch('/@_api/admin/stripe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'finalize_invoice', invoice: invoice.id, memo, rendering_template: renderingTemplate })
    });
    const body = await response.json().catch(() => ({}));
    stripeBusy[invoice.id] = false;
    stripeBusy = { ...stripeBusy };
    if (!response.ok) return alert(body.error || 'Arve finaliseerimine ebaõnnestus.');
    stripeInvoices = stripeInvoices.map((row) => row.id === invoice.id ? {
      ...row, status: body.invoice.status, number: body.invoice.number, due_date: body.invoice.due_date,
      url: body.invoice.hosted_invoice_url, invoice_pdf: body.invoice.invoice_pdf, object: body.invoice
    } : row);
  }
</script>

<section class="invoices-page grid gap _3">
  <section class="transactions-overview grid gap _2">
    <header>
      <small>Transactions</small>
      <h2>Arved ja laekumised</h2>
      <p>Roheline näitab makstud ning kollane veel laekumata arveid loomise kuu järgi.</p>
    </header>
    <div class="chart-wrap"><Income_SVG months={stripeChartMonths} width={920} height={180} /></div>
  </section>
  <hr />
  <header class="page-head flex gap _2 _center _y _wrap _space">
    <div>
      <h2>Arve</h2>
      <small>Arved, read ja seosed ettevõtte/projektiga ühes selges vaates.</small>
    </div>
    <div class="filters">
      <input placeholder="Otsi arvet, ettevõtet või emaili..." bind:value={search}>
      <select bind:value={projectFilter}>
        <option value="">Kõik projektid</option>
        {#each projects as item}
          <option value={item.id}>{item.title}</option>
        {/each}
      </select>
      <button type="button" on:click={() => sortNewestFirst = !sortNewestFirst}>{sortNewestFirst ? 'Uuemad ees' : 'Vanemad ees'}</button>
      <button class="btn _color flex gap _2 _space" type="button" popovertarget="invoice_create">Loo arve</button>
    </div>
  </header>

  <Popover id="invoice_create" width={980} showLanguage={false}>
  <div class="create-panel gap _2 grid">
    <header class="flex gap _2 _space _wrap _center _y">
      <div>
        <small>draft</small>
        <h3>Uus arve</h3>
      </div>
      <button class="btn _transparent flex gap _2 _space" type="button" on:click={cancelDraft}>Tühista</button>
    </header>
    <label class="grid gap"><span>Template</span><select bind:value={draft.template}>
      {#each invoiceTemplates as template}
        <option value={template.id}>{template.label}</option>
      {/each}
    </select></label>
    <label class="grid gap"><span>Stripe invoice template</span><select bind:value={draft.rendering_template}>
      <option value="">Stripe default template</option>
      {#each invoiceTemplatesFromStripe as template}<option value={template.id}>{template.nickname || template.id} · v{template.version}</option>{/each}
    </select></label>
    <label class="grid gap"><span>Klient</span><select bind:value={draft.customer_key}>
      <option value="">Vali klient</option>
      {#each invoiceCustomers as item}
        <option value={item.key}>{item.label} {item.email ? `(${item.email})` : ''} - {item.source}</option>
      {/each}
    </select></label>
    <label class="grid gap"><span>Projekt / teenus</span><select bind:value={draft.projekt_id}>
      <option value="">Projektita</option>
      {#each projects as item}
        <option value={item.id}>{item.title}</option>
      {/each}
    </select></label>
    <label class="grid gap"><span>Arve email</span><input type="email" placeholder="Kliendi email" bind:value={draft.email}></label>
    <label class="grid gap"><span>Stripe product</span><select bind:value={draftProduct}>
      <option value="">Vali toode/hind</option>
      {#each productPriceOptions as item}
        <option value={item.key}>{item.label}</option>
      {/each}
    </select></label>
    <button type="button" on:click={addDraftProduct} disabled={!draftProduct} class="flex gap _2 _space">Lisa product</button>
    <label class="grid gap"><span>Custom item</span><input placeholder="Rea nimetus" bind:value={draftCustom.description}></label>
    <label class="grid gap"><span>Kogus</span><input type="number" min="0" step="0.01" bind:value={draftCustom.quantity}></label>
    <label class="grid gap"><span>Ühiku hind</span><input type="number" min="0" step="0.01" bind:value={draftCustom.amount}></label>
    <button type="button" on:click={addDraftCustom} disabled={!draftCustom.description.trim()} class="flex gap _2 _space">Lisa custom</button>
    <label class="memo grid gap"><span>Memo</span><textarea rows="3" placeholder={selectedTemplate()?.memo || 'Lisa arvele kokkuvõte'} bind:value={draft.note}></textarea></label>
    {#if draftItems.length}
      <div class="invoice-preview gap grid">
        <strong>Arve read: {draftPreviewTotal.toFixed(2)} EUR</strong>
        {#each draftItems as item, index}
          <button type="button" class="flex gap _2 _space" on:click={() => removeDraftLine(index)}>
            <span>{item.description}</span>
            <small>{Number(item.hours || 1)} x {Number(item.hourly_rate || item.amount || 0).toFixed(2)} EUR</small>
            <b>{Number(item.amount || 0).toFixed(2)} EUR</b>
          </button>
        {/each}
      </div>
    {/if}
    <div class="actions wide">
      <button type="button" on:click={cancelDraft} class="flex gap _2 _space">Tühista</button>
      <button class="btn _color flex gap _2 _space" type="button" on:click={createInvoice} disabled={saving}>{saving ? 'Loon...' : 'Loo arve'}</button>
    </div>
  </div>
  </Popover>

  <section class="stripe-invoice-panel grid gap _3">
    <header class="flex gap _2 _center _y _wrap _space">
      <div>
        <h3>Stripe invoices</h3>
        <small>{stripeRows.length} Stripe Sync Engine’i arvet. Rea avamisel näed arve andmeid ja sellega seotud Transactions ridu.</small>
      </div>
      <button type="button" class="flex gap _2 _space" on:click={() => openAdminTab('disputes')}>Disputes</button>
    </header>
    <StripeInvoiceTable title="Maksmata arved" rows={unpaidStripeRows} emptyText="Maksmata Stripe’i arveid ei ole."
      openInvoice={openStripeInvoice} toggleInvoice={toggleStripeInvoice} {invoiceTransactions} {dueDate} {isOverdue}
      workLogs={invoiceWorkLogs} templates={invoiceTemplatesFromStripe} finalizeInvoice={finalizeStripeInvoice}
      projects={availableProjects} availableWorkLogs={availableWorkLogs} {workLogHours} attachRelations={attachDraftRelations}
      updateDraft={updateDraftInvoice} cancelDraft={cancelDraftInvoice}
      money={stripeMoney} paymentPage={invoicePaymentPage} pdf={stripePdf} canApplyLateFee={canApplyStripeLateFee}
      addLateFee={addStripeLateFee} markPaid={markStripeInvoicePaid} busy={stripeBusy} paid={false} />
    <StripeInvoiceTable title="Makstud arved" rows={paidStripeRows} emptyText="Makstud Stripe’i arveid ei ole."
      openInvoice={openStripeInvoice} toggleInvoice={toggleStripeInvoice} {invoiceTransactions} {dueDate} {isOverdue}
      workLogs={invoiceWorkLogs} templates={invoiceTemplatesFromStripe} finalizeInvoice={finalizeStripeInvoice}
      projects={availableProjects} availableWorkLogs={availableWorkLogs} {workLogHours} attachRelations={attachDraftRelations}
      updateDraft={updateDraftInvoice} cancelDraft={cancelDraftInvoice}
      money={stripeMoney} paymentPage={invoicePaymentPage} pdf={stripePdf} canApplyLateFee={canApplyStripeLateFee}
      addLateFee={addStripeLateFee} busy={stripeBusy} paid={true} />
  </section>
</section>

<style>
  .invoices-page {
    width: min(1200px, 100%);
    margin: 0 auto;    text-align: left;
  }

  .page-head {
    justify-content: space-between;
  }

  .transactions-overview,
  .stripe-invoice-panel {
    min-width: 0;
  }

  .transactions-overview p {
    margin: 6px 0 0;
    color: var(--x_text_color);
  }

  .chart-wrap {
    width: 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    color: #e5e7eb;
  }

  .chart-wrap :global(svg) {
    display: block;
    min-width: 720px;
    max-width: none;
  }

  .stripe-invoice-panel > header {
    padding: 16px 18px;
  }

  h2,
  h3 {
    margin: 0;
  }

  .create-panel {    grid-template-columns: minmax(0, 1fr);
    padding: clamp(16px, 3vw, 24px);
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 14%, transparent);
    border-radius: 8px;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--x_color, #da3) 12%, transparent), transparent 22rem),
      #050505;
    color: var(--reverse, #fff);
    color-scheme: dark;
  }

  .create-panel :is(input, select, textarea) {
    width: 100%;
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 16%, transparent);
    background: color-mix(in srgb, var(--reverse, #fff) 7%, transparent);
    color: var(--reverse, #fff);
  }

  .create-panel button {
    width: fit-content;
  }

  .invoice-preview {
    grid-column: 1 / -1;    min-width: min(360px, 100%);
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 12%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--reverse, #fff) 6%, transparent);
    padding: 10px;
  }

  .create-panel .memo {
    grid-column: 1 / -1;
  }


  .invoice-preview button {    text-align: left;
  }

  .create-panel label {    min-width: min(220px, 100%);
  }

  label span {
    color: var(--x_text_color);
    font-size: 12px;
  }

</style>
