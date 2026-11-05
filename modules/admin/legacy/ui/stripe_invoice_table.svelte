<svelte:options runes={false} />
<script>
  import { formatDate } from '$lib/assets/scripts/helpers';
  import { openAdminTab } from './context.js';

  export let title = '';
  export let rows = [];
  export let emptyText = '';
  export let openInvoice = '';
  export let toggleInvoice = () => {};
  export let invoiceTransactions = () => [];
  export let dueDate = () => new Date();
  export let isOverdue = () => false;
  export let money = () => '';
  export let paymentPage = () => '';
  export let pdf = () => '';
  export let canApplyLateFee = () => false;
  export let addLateFee = () => {};
  export let markPaid = () => {};
  export let workLogs = () => [];
  export let templates = [];
  export let finalizeInvoice = () => {};
  export let projects = () => [];
  export let availableWorkLogs = () => [];
  export let workLogHours = () => 0;
  export let attachRelations = () => false;
  export let updateDraft = () => false;
  export let cancelDraft = () => false;
  export let busy = {};
  export let paid = false;
  let projectDrafts = {};
  let workDrafts = {};
  let invoiceDrafts = {};

  function stop(event) {
    event.stopPropagation();
  }

  function selectedProject(invoice) {
    return projectDrafts[invoice.id] ?? invoice.metadata?.project_id ?? invoice.object?.metadata?.project_id ?? '';
  }

  function selectedWork(invoice, linkedWork = []) {
    return workDrafts[invoice.id] ?? linkedWork.map((row) => row.id);
  }

  function toggleWork(invoice, linkedWork, id, checked) {
    const current = selectedWork(invoice, linkedWork);
    workDrafts = {
      ...workDrafts,
      [invoice.id]: checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)
    };
  }

  async function saveRelations(invoice, linkedWork) {
    return await attachRelations(invoice, selectedProject(invoice), selectedWork(invoice, linkedWork));
  }

  async function finalizePreparedInvoice(invoice, linkedWork) {
    const editor = draftEditor(invoice);
    const updated = await updateDraft(invoice, editor);
    if (!updated) return;
    const saved = await saveRelations(invoice, linkedWork);
    if (!saved) return;
    await finalizeInvoice(invoice, editor.note, editor.rendering_template);
  }

  function draftEditor(invoice) {
    if (!invoiceDrafts[invoice.id]) {
      const object = invoice.object || invoice;
      invoiceDrafts[invoice.id] = {
        email: invoice.email || object.customer_email || '',
        note: object.description || '',
        days_until_due: object.days_until_due || 10,
        currency: invoice.currency || object.currency || 'eur',
        rendering_template: object.rendering_options?.template || '',
        lines: (object.lines?.data || []).map((line) => ({
          description: line.description || '',
          amount: Number(line.amount || 0) / 100,
          work_log_id: line.metadata?.work_log_id || ''
        }))
      };
      invoiceDrafts = { ...invoiceDrafts };
    }
    return invoiceDrafts[invoice.id];
  }

  function addDraftLine(invoice) {
    const editor = draftEditor(invoice);
    editor.lines = [...editor.lines, { description: '', amount: 0, work_log_id: '' }];
    invoiceDrafts = { ...invoiceDrafts };
  }

  function removeDraftLine(invoice, index) {
    const editor = draftEditor(invoice);
    editor.lines = editor.lines.filter((_, itemIndex) => itemIndex !== index);
    invoiceDrafts = { ...invoiceDrafts };
  }
</script>

<section class="invoice-table-section">
  <header class="table-title flex gap _2 _center _y _space _wrap">
    <div>
      <h3>{title}</h3>
      <small>{rows.length} arvet</small>
    </div>
  </header>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Arve</th><th>Klient</th><th>Status</th><th>Summa</th><th>Viivise kuupäev</th><th>Loodud</th><th>Tegevused</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as invoice}
          {@const related = invoiceTransactions(invoice)}
          {@const linkedWork = workLogs(invoice)}
          {@const payable = ['open', 'uncollectible'].includes(String(invoice.status || '').toLowerCase())}
          <tr class="invoice-row" class:open={openInvoice === invoice.id} onclick={() => toggleInvoice(invoice)}>
            <td><b>{invoice.number || invoice.id}</b></td>
            <td>{invoice.email || invoice.customer || '-'}</td>
            <td><span class:paid class:unpaid={!paid} class="status-pill">{paid ? 'Makstud' : 'Maksmata'}</span></td>
            <td>{money(paid ? (invoice.amount_paid ?? invoice.amount) : (invoice.amount_remaining ?? invoice.amount_due ?? invoice.amount), invoice.currency)}</td>
            <td><span class:overdue={isOverdue(invoice)} class="due-pill">{formatDate(dueDate(invoice))}</span></td>
            <td>{formatDate(invoice.created_at)}</td>
            <td onclick={stop}>
              <div class="actions">
                {#if !paid && payable && String(invoice.id || '').startsWith('in_')}<a class="btn" href={paymentPage(invoice)}>Maksa</a>{/if}
                {#if !paid && payable}<button type="button" onclick={() => markPaid(invoice)} disabled={busy[invoice.id]}>Märgi makstuks</button>{/if}
                {#if invoice.url}<a href={invoice.url} target="_blank" rel="noreferrer">Stripe</a>{/if}
                {#if pdf(invoice)}<a href={pdf(invoice)} target="_blank" rel="noreferrer">PDF</a>{/if}
                {#if canApplyLateFee(invoice)}
                  <button type="button" onclick={() => addLateFee(invoice)} disabled={busy[invoice.id]}>{busy[invoice.id] ? 'Lisan…' : 'Lisa viivis'}</button>
                {/if}
              </div>
            </td>
          </tr>
          {#if openInvoice === invoice.id}
            <tr class="detail-row">
              <td colspan="7">
                <div class="invoice-detail grid gap _3">
                  <div class="detail-grid">
                    <article class="long-value"><small>Stripe invoice ID</small><b>{invoice.id}</b></article>
                    <article><small>Invoice number</small><b>{invoice.number || '-'}</b></article>
                    <article class="long-value"><small>Customer ID</small><b>{invoice.customer || '-'}</b></article>
                    <article class="long-value"><small>Email</small><b>{invoice.email || invoice.object?.customer_email || '-'}</b></article>
                    <article><small>Currency</small><b>{String(invoice.currency || 'eur').toUpperCase()}</b></article>
                    <article><small>Payment intent</small><b>{invoice.payment_intent || invoice.object?.payment_intent || '-'}</b></article>
                  </div>

                  <hr class="_x">

                  <div class="related grid gap _2">
                    <div class="detail-actions actions">
                      {#if invoice.email || invoice.object?.customer_email}
                        <button type="button" onclick={() => openAdminTab('kasutajad', { email: invoice.email || invoice.object?.customer_email })}>Ava klient</button>
                      {/if}
                      {#if invoice.metadata?.company_id}<button type="button" onclick={() => openAdminTab('ettevote', { ettevote: invoice.metadata.company_id })}>Ava ettevõte</button>{/if}
                      {#if invoice.metadata?.project_id}<button type="button" onclick={() => openAdminTab('projekt', { projekt: invoice.metadata.project_id })}>Ava projekt</button>{/if}
                      {#if invoice.url}<a href={invoice.url} target="_blank" rel="noreferrer">Muuda Stripe’is</a>{/if}
                    </div>
                    <header><h4>Seotud Transactions</h4><small>{related.length} Stripe’i tehingurida</small></header>
                    <div class="table-wrap inner">
                      <table>
                        <thead><tr><th>Tüüp</th><th>ID</th><th>Status</th><th>Summa</th><th>Kuupäev</th><th>Link</th></tr></thead>
                        <tbody>
                          {#each related as transaction}
                            <tr>
                              <td>{transaction.kind || '-'}</td><td><b>{transaction.id}</b></td><td>{transaction.status || '-'}</td>
                              <td>{money(transaction.amount, transaction.currency)}</td><td>{formatDate(transaction.created_at)}</td>
                              <td>{#if transaction.url}<a href={transaction.url} target="_blank" rel="noreferrer">Ava</a>{:else}-{/if}</td>
                            </tr>
                          {:else}
                            <tr><td colspan="6">Selle arvega seotud eraldi tehinguridu ei ole. Arve ise on Stripe Sync Engine’is olemas.</td></tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {#if linkedWork.length || invoice.status === 'draft'}
                    <div class="draft-workflow grid gap _3">
                      <div class="work-summary grid gap _2">
                        <header><h4>Seotud tehtud töö</h4><small>{linkedWork.length} kirjet</small></header>
                        {#if invoice.status === 'draft'}
                          <div class="relation-builder grid gap _2">
                            <label class="grid gap"><span>Sidumata projekt</span><select value={selectedProject(invoice)} onchange={(event) => projectDrafts = { ...projectDrafts, [invoice.id]: event.currentTarget.value }}>
                              <option value="">Projektita</option>
                              {#each projects(invoice) as project}<option value={project.id}>{project.title || project.name || project.id}</option>{/each}
                            </select></label>
                            <fieldset class="work-picker grid gap _2">
                              <legend>Lisa arvele sidumata tehtud tööd</legend>
                              {#each availableWorkLogs(invoice) as work}
                                {@const amount = workLogHours(work) * Number(work.hourly_rate || work.metadata?.unit_amount || 0)}
                                {@const alreadyLinked = linkedWork.some((row) => row.id === work.id)}
                                <label class="work-option flex gap _2 _center _y" title={amount > 0 ? '' : 'Lisa töölogile enne tunnihind'}>
                                  <input type="checkbox" checked={selectedWork(invoice, linkedWork).includes(work.id)} disabled={alreadyLinked || amount <= 0} onchange={(event) => toggleWork(invoice, linkedWork, work.id, event.currentTarget.checked)}>
                                  <span><b>{work.service || work.title || 'Töö'}</b><small>{workLogHours(work).toFixed(2)} h · {Number(work.hourly_rate || work.metadata?.unit_amount || 0).toFixed(2)} EUR/h</small></span>
                                </label>
                              {:else}
                                <small>Sidumata lõpetatud töid ei ole.</small>
                              {/each}
                            </fieldset>
                            <button type="button" disabled={busy[invoice.id]} onclick={() => saveRelations(invoice, linkedWork)}>Salvesta seosed arvele</button>
                          </div>
                        {/if}
                        <div class="work-list grid gap _2">
                          {#each linkedWork as work}
                            <article><b>{work.service || work.metadata?.title || 'Töö'}</b><p>{work.description || work.metadata?.note || 'Kirjeldus puudub'}</p><small>{work.duration_hours ? `${work.duration_hours} h` : formatDate(work.started_at)}</small></article>
                          {:else}<p>Seo töölogi selle draft-arve Stripe Invoice ID-ga.</p>{/each}
                        </div>
                      </div>
                      {#if invoice.status === 'draft'}
                        {@const editor = draftEditor(invoice)}
                        <div class="memo-builder grid gap _2">
                          <header><h4>Arve muutmine ja finaliseerimine</h4><small>Kontrolli kliendi andmed, read ja memo enne arve väljastamist.</small></header>
                          <label class="grid gap"><span>Kliendi e-post</span><input type="email" bind:value={editor.email}></label>
                          <label class="grid gap"><span>Maksetähtaeg päevades</span><input type="number" min="1" max="90" bind:value={editor.days_until_due}></label>
                          <div class="draft-lines grid gap _2">
                            {#each editor.lines as line, index}
                              <div class="draft-line grid gap _2"><input placeholder="Arverea kirjeldus" bind:value={line.description}><input type="number" min="0" step="0.01" bind:value={line.amount}><button type="button" onclick={() => removeDraftLine(invoice, index)}>Eemalda</button></div>
                            {/each}
                            <button type="button" onclick={() => addDraftLine(invoice)}>Lisa arverida</button>
                          </div>
                          <textarea rows="6" placeholder="Kokkuvõte kliendile…" bind:value={editor.note}></textarea>
                          <select bind:value={editor.rendering_template}>
                            <option value="">Stripe default template</option>
                            {#each templates as template}<option value={template.id}>{template.nickname || template.id} · v{template.version}</option>{/each}
                          </select>
                          <div class="actions"><button type="button" disabled={busy[invoice.id]} onclick={() => updateDraft(invoice, editor)}>Salvesta draft</button><button class="danger" type="button" disabled={busy[invoice.id]} onclick={() => cancelDraft(invoice)}>Tühista arve</button><button class="finalize" type="button" disabled={busy[invoice.id]} onclick={() => finalizePreparedInvoice(invoice, linkedWork)}>Finaliseeri ja valmista kliendile</button></div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </td>
            </tr>
          {/if}
        {:else}
          <tr><td colspan="7">{emptyText}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  .invoice-table-section { min-width: 0; overflow: hidden; border: 1px solid #222; border-radius: 8px; background: #050505; }
  .table-title { padding: 16px 18px; border-bottom: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent); }
  h3, h4 { margin: 0; }
  .table-wrap { width: 100%; min-width: 0; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; background: #050505; }
  th, td { padding: 12px 14px; text-align: left; vertical-align: middle; border-bottom: 1px solid color-mix(in srgb, var(--reverse) 9%, transparent); }
  th { white-space: nowrap; font-size: 12px; opacity: .72; }
  td small { display: block; margin-top: 3px; opacity: .62; }
  .invoice-row { cursor: pointer; transition: background .16s ease; }
  .invoice-row:hover, .invoice-row.open { background: color-mix(in srgb, var(--x_color, #d9a72a) 8%, transparent); }
  .status-pill, .due-pill { display: inline-flex; padding: 5px 9px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .status-pill.paid { color: #054f31 !important; background: #abefc6 !important; }
  .status-pill.unpaid { color: #7a271a !important; background: #fecdca !important; }
  .due-pill { background: color-mix(in srgb, var(--reverse) 7%, transparent); }
  .due-pill.overdue { color: #fff; background: #d92d20; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .detail-row > td { width: 100%; max-width: 0; padding: 0; background: color-mix(in srgb, var(--reverse) 3%, transparent); }
  .invoice-detail, .related { width: 100%; max-width: 100%; min-width: 0; }
  .invoice-detail { padding: 18px; box-sizing: border-box; overflow: hidden; }
  .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); align-items: start; gap: 10px; }
  .detail-grid article { width: 100%; min-width: 0; max-width: 100%; padding: 12px; box-sizing: border-box; overflow: hidden; border: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent); border-radius: 8px; }
  .detail-grid .long-value { grid-column: span 2; min-height: max-content; }
  .detail-grid b { display: block; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
  .detail-actions { min-width: 0; }
  .inner { border: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent); border-radius: 8px; overflow-x: hidden; }
  .inner table { width: 100%; min-width: 0; table-layout: fixed; }
  .inner :is(th, td) { min-width: 0; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
  .draft-workflow { grid-template-columns: minmax(0, 1fr) minmax(280px, 1fr); align-items: start; border-top: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent); padding-top: 14px; }
  .work-summary, .memo-builder, .work-list { min-width: 0; }
  .work-list article { min-width: 0; padding: 11px; border: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent); border-radius: 8px; }
  .work-list p { margin: 5px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .relation-builder { padding: 12px; border: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent); border-radius: 8px; background: color-mix(in srgb, var(--reverse) 4%, transparent); }
  .relation-builder :is(select, button) { width: 100%; box-sizing: border-box; }
  .work-picker { max-height: 220px; overflow: auto; margin: 0; border: 0; padding: 0; }
  .work-option { min-width: 0; padding: 8px; border-radius: 6px; background: color-mix(in srgb, var(--reverse) 5%, transparent); cursor: pointer; }
  .work-option input { width: auto; }
  .work-option span { display: grid; min-width: 0; }
  .work-option :is(b, small) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .memo-builder textarea, .memo-builder select { width: 100%; max-width: 100%; box-sizing: border-box; }
  .memo-builder input { width: 100%; box-sizing: border-box; }
  .draft-line { grid-template-columns: minmax(0,1fr) 110px auto; }
  .danger { color: #ff8b8b; border-color: #ff8b8b66; }
  .finalize { justify-self: end; }
  @media (max-width: 800px) { .draft-workflow { grid-template-columns: 1fr; } }
  @media (max-width: 700px) { th, td { padding: 10px; } .invoice-detail { padding: 12px; } .detail-grid .long-value { grid-column: 1 / -1; } }
</style>
