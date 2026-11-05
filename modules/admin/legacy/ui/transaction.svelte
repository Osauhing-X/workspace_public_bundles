<svelte:options runes={false} />
<script>
  import { timeAgo, formatDate } from '$lib/assets/scripts/helpers'
  import { page } from '$app/stores'
  import Income_SVG from './income_svg.svelte'
  import { openAdminTab, openMailDraft } from './context.js'
  import { formatInvoiceNumber, invoiceDue } from '$lib/paths/invoice.js'

  export let data = null;
  $: adminData = { ...($page.data || {}), ...(data || {}) };

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function invoiceItems(invoice = {}) {
    if (invoice.kind || invoice.customer || invoice.status || invoice.amount) {
      return [{
        ...invoice,
        date: invoice.created_at || invoice.date,
        what: invoice.kind || invoice.status || 'stripe',
        full_name: invoice.name || invoice.customer || '',
        email: invoice.email || '',
        amount: Number(invoice.amount || 0) / (invoice.source === 'stripe_api_pending_sync' || invoice.kind ? 100 : 1),
        invoice: invoice.arve_nr || invoice.invoice_nr || invoice.number ||
          (invoice.kind === 'invoice' ? invoice.id : invoice.object?.invoice) || '',
        reference: invoice.id,
        transaction: invoice.id
      }];
    }
    return asArray(invoice.hinnad).length ? asArray(invoice.hinnad) : asArray(invoice.line_items);
  }

  let payments = []
  let sending = {}
  let paymentBusy = {}
  let unpaidVisible = {}

  function groupByMonth(payments) {
    const result = {}

    for (const invoice of asArray(payments)) {
      for (const item of invoiceItems(invoice)) {
        const d = new Date(item.date)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`

        if (!result[key]) {
          result[key] = { income:0, billed:0, items:[] }
        }

        result[key].items.push({
          ...item,
          invoice: item.invoice || invoice.arve_nr || invoice.invoice_nr || invoice.number || '',
        })
      }
    }

    for (const month of Object.values(result)) {
      const paidInvoices = new Set(
        month.items
          .filter(isPaidPayment)
          .map(paymentInvoiceKey)
          .filter(Boolean)
      );

      const countedPaidInvoices = new Set();
      month.income = month.items
        .filter(isPaidPayment)
        .reduce((sum, item) => {
          const key = paymentInvoiceKey(item);
          if (key && countedPaidInvoices.has(key)) return sum;
          if (key) countedPaidInvoices.add(key);
          return sum + Math.abs(Number(item.amount || 0));
        }, 0);
      month.billed = month.items
        .filter((item) => !isPaidPayment(item))
        .filter((item) => {
          const key = paymentInvoiceKey(item);
          return !key || !paidInvoices.has(key);
        })
        .reduce((sum, item) => sum + Math.max(Number(item.amount || 0), 0), 0);
    }

    return result
  }

  $: allPayments = asArray(adminData.payments_data)
  $: payments = allPayments.filter((item) => !isDefaultHiddenPayment(item))
  $: hiddenMonthly = groupByMonth(allPayments.filter(isDefaultHiddenPayment))
  $: monthly = groupByMonth(payments)
  $: months = Object.entries(monthly).sort((a,b) => a[0].localeCompare(b[0]))
  $: maxValue = Math.max(...months.map(m => Math.max(m[1].income,m[1].billed)),1)

  function scrollToMonth(month) {
    document.getElementById(month).scrollIntoView({ behavior: 'smooth' })
  }

  $: openInvoices = asArray(adminData.arve_data)
    .filter(invoice => invoice.active && invoice.public_id && invoiceDue(invoice) > 0)
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))

  function contactInvoice(invoice) {
    const nr = formatInvoiceNumber(invoice)
    openMailDraft({
      to: invoice.email || invoice.view?.[0] || '',
      subject: `Arve ${nr}`,
      text: `Tere!\n\nKirjutan arve ${nr} kohta.\nTasumisele kuuluv summa on ${invoiceDue(invoice)} EUR.\nWorkspace arvevaade: ${location.origin}/info?what=payment&id=${invoice.public_id}\n\nArve avamine, maksmine ja makseajalugu on Workspace portaalis.\n\nKui teil tekib küsimusi, vastake palun sellele kirjale.\n\nParimat\nExtaas`,
      source: { type: 'invoice', id: invoice.arve_nr }
    })
  }

  async function sendInvoice(invoice) {
    const to = invoice.email || invoice.view?.[0]
    if (!to) return alert('Arvel puudub kliendi e-post.')
    if (!confirm(`Saada arve ${formatInvoiceNumber(invoice)} workspace link aadressile ${to}`)) return

    sending[invoice.arve_nr] = true
    sending = { ...sending }
    const response = await fetch('/@_api/admin/invoice-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arve_nr: invoice.arve_nr, to })
    })
    sending[invoice.arve_nr] = false
    sending = { ...sending }

    alert(response.ok ? 'Arve saadetud.' : 'Arve saatmine ebaõnnestus.')
  }

  function paymentStatus(row = {}) {
    return String(row.status || row.payment_status || row.object?.status || '').toLowerCase()
  }

  function isPaidPayment(row = {}) {
    return ['paid', 'succeeded', 'complete', 'refunded'].includes(paymentStatus(row))
  }

  function paymentInvoiceKey(row = {}) {
    return String(
      row.invoice || row.stripe_invoice_id || row.object?.invoice ||
      (row.kind === 'invoice' ? row.id : '') || ''
    ).trim()
  }

  function paymentIntentId(row = {}) {
    const intent = row.payment_intent || row.object?.payment_intent || row.object?.id;
    return typeof intent === 'string' && intent.startsWith('pi_') ? intent : '';
  }

  function paymentKey(row = {}) {
    return row.id || row.reference || row.transaction || row.provider_session_id || ''
  }

  function isDefaultHiddenPayment(row = {}) {
    return String(row.kind || row.what || row.source || '').toLowerCase() === 'checkout' &&
      ['unpaid', 'no_payment_required'].includes(paymentStatus(row))
  }

  function monthItems(month, data) {
    const hidden = unpaidVisible[month] ? asArray(hiddenMonthly[month]?.items) : []
    return [...asArray(data.items), ...hidden]
  }

  function toggleUnpaid(month) {
    unpaidVisible = { ...unpaidVisible, [month]: !unpaidVisible[month] }
  }

  function canDeletePayment(row = {}) {
    const status = paymentStatus(row)
    if (isPaidPayment(row)) return false
    return Boolean(paymentKey(row))
  }

  function shouldCallStripeCancel(row = {}) {
    const status = paymentStatus(row)
    if (['canceled', 'cancelled', 'expired', 'failed'].includes(status)) return false
    return (row.kind === 'checkout' && String(row.id || '').startsWith('cs_') && status === 'open') ||
      (row.kind === 'payment_intent' && String(row.id || paymentIntentId(row)).startsWith('pi_'))
  }

  async function stripePaymentAction(row) {
    const key = paymentKey(row)
    if (!canDeletePayment(row) || !key) return
    if (!confirm(`Delete makserida ${key}`)) return

    if (!shouldCallStripeCancel(row)) return

    paymentBusy[key] = true
    paymentBusy = { ...paymentBusy }
    const payload = row.kind === 'checkout'
      ? { action: 'expire_checkout_session', session: row.id }
      : { action: 'cancel_payment_intent', payment_intent: row.id || paymentIntentId(row), reason: 'abandoned' }
    const response = await fetch('/@_api/admin/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const body = await response.json().catch(() => ({}))
    paymentBusy[key] = false
    paymentBusy = { ...paymentBusy }
    if (!response.ok) return alert(body.error || 'Makse kustutamine ebaõnnestus.')
  }
</script>

<div class="payments-page grid gap _5">
<!-- Kasutame uut SVG komponenti -->
<Income_SVG {months} {maxValue} on:barClick={(e) => scrollToMonth(e.detail)} />

<hr />

{#if openInvoices.length}
  <div class="panel">
    <table>
      <caption>Tasumata arved</caption>
      <thead>
        <tr>
          <th>Arve</th>
          <th>Email</th>
          <th>Summa</th>
          <th>Workspace</th>
          <th>Tegevused</th>
        </tr>
      </thead>
      <tbody>
        {#each openInvoices as invoice}
          <tr>
            <td>{formatInvoiceNumber(invoice)}</td>
            <td>{invoice.email || invoice.view?.[0] || 'Puudub'}</td>
            <td>{invoiceDue(invoice)}€</td>
            <td><a href={`/info?what=payment&id=${invoice.public_id}`}>Ava</a></td>
            <td>
              <div class="actions gap flex">
                <button type="button" on:click={() => sendInvoice(invoice)} disabled={sending[invoice.arve_nr]}>
                  {sending[invoice.arve_nr] ? 'Saadan...' : 'Saada arve'}
                </button>
                <button type="button" on:click={() => openAdminTab('arve', { arve: invoice.invoice_nr || invoice.arve_nr })}>Muuda arvet</button>
                <button type="button" on:click={() => contactInvoice(invoice)}>Contact</button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<!-- Detail view -->
{#each months as [month, data]}
  <details id={month} style="margin-bottom:1rem;" open>
    <summary class="flex gap _5 _middle">
      <strong>{month}</strong>
      <span class="sum _positive flex">+ {data.income}€</span>
      <span class="sum _negative flex">- {data.billed}€</span>
    </summary>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Arve Nr</th>
            <th>Tüüp</th>
            
            
            <th>Nimi</th>
            <th>Email</th>
            
            <th>Summa</th>
            <th>Viide</th>
            
            <th>Kuupäev</th>
            <th>Tegevused</th>
          </tr>
        </thead>
        <tbody>
          {#each monthItems(month, data) as item}
            <tr>
              <td>{item.invoice}</td>
              <td>{item.what}</td>
              <td>{item.full_name}</td>
              <td>{item.email}</td>
              <td style:color={item.amount < 0 ? 'green' : 'gold'}>{item.amount}€</td>
              <td>{item.reference || item.transaction}</td>
              <td title={formatDate(item.date)}>{timeAgo(item.date)}</td>
              <td>
                <div class="actions gap flex">
                  {#if item.url}<a href={item.url} target="_blank" rel="noreferrer">Ava</a>{/if}
                  <button type="button" on:click={() => openAdminTab('arve', { arve: item.invoice })}>Muuda</button>
                  {#if canDeletePayment(item)}
                    <button type="button" class="danger" on:click={() => stripePaymentAction(item)} disabled={paymentBusy[paymentKey(item)]}>
                      {paymentBusy[paymentKey(item)] ? '...' : 'Delete'}
                    </button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if hiddenMonthly[month]?.items?.length}
      <button class="unpaid-toggle" type="button" on:click={() => toggleUnpaid(month)}>
        {unpaidVisible[month] ? 'Peida unpaid checkout read' : `Näita unpaid checkout ridu (${hiddenMonthly[month].items.length})`}
      </button>
    {/if}
  </details>
{/each}



</div>

<style>
  .payments-page {
    width: min(1300px, 100%);
    min-width: 0;
    margin: 0 auto;
  }

  .table-wrap,
  .panel {
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-gutter: stable;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    border: 1px solid color-mix(in srgb, var(--reverse) 12%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--reverse) 6%, transparent);
  }

  summary {
    color: var(--reverse, #fff);
    color-scheme: dark;
    cursor: pointer;
    padding: 8px 0 10px;
  }

  details {
    min-width: 0;
    max-width: 100%;
  }

  summary strong {
    color: inherit;
  }

  .sum {    align-items: center;
    border-radius: 999px;
    padding: 4px 9px;
    color: #fff !important;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
  }

  .sum._positive {
    background: color-mix(in srgb, #0f9f5b 88%, #000);
  }

  .sum._negative {
    background: color-mix(in srgb, #b91c1c 88%, #000);
  }

  .unpaid-toggle {
    margin-top: 8px;
    border: 0;
    background: transparent;
    color: color-mix(in srgb, var(--reverse, #fff) 68%, transparent);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  :global(.payments-page svg) {
    color: var(--reverse, #fff);
  }

  table {
    width: 100%;
    min-width: 880px;
    border-collapse: collapse;
  }

  th {
    padding: 10px 12px;
    text-align: left;
    color: color-mix(in srgb, var(--reverse) 86%, transparent);
    white-space: nowrap;
  }

  td {
    padding: 10px 12px;
    border-top: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent);
    white-space: nowrap;
  }

  .panel {
    margin-bottom: 1rem;
  }

  .actions {    flex-wrap: wrap;
  }
</style>
