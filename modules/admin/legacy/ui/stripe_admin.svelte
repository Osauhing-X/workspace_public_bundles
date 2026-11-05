<svelte:options runes={false} />

<script>
  import { page } from '$app/stores';
  import Popover from '$lib/components/popover.svelte';

  export let data = null;
  $: adminData = { ...($page.data || {}), ...(data || {}) };

  export let mode = 'customers';
  export let stripeData = null;
  export let stripeHealth = null;
  export let authCustomerRows = null;

  let stripe = {};
  let health = {};
  let authCustomers = [];
  let busy = false;
  let result = null;
  let customerDraft = { name: '', email: '', type: 'client' };
  let productDraft = { name: '', description: '' };
  let priceDraft = { product: '', amount: 0, currency: 'eur', recurring: false, interval: 'month' };
  let subscriptionDraft = {
    customer: '', price: '', plan: 'basic', weekly_limit: 200,
    offer_type: 'public', portal_ids: '', offer_label: '', description: '',
    workspace_enabled: true, ends_on: '', days_until_due: 14,
    price_mode: 'existing', product: '', product_name: '', amount: 0, currency: 'eur', interval: 'month'
  };
  let selectedDispute = null;
  let disputeDrafts = {};
  let localStripeRows = {
    customers: [],
    products: [],
    prices: [],
    subscriptions: [],
    refunds: [],
    disputes: [],
    transactions: [],
    setup_intents: [],
    credit_notes: []
  };

  const labels = {
    customers: 'Customers',
    products: 'Products',
    subscriptions: 'Subscriptions',
    refunds: 'Refunds',
    disputes: 'Disputes',
    transactions: 'Transactions',
    setup_intents: 'Setup intents',
    credit_notes: 'Credit notes'
  };
  const healthKeys = {};
  const transactionHealthKeys = ['checkout_sessions', 'payment_intents', 'charges', 'setup_intents', 'credit_notes'];

  $: stripe = stripeData || adminData.stripe_data || {};
  $: health = stripeHealth || adminData.stripe_health || {};
  $: authCustomers = authCustomerRows || adminData.customer_users_data?.users || [];
  $: rows = mergedStripeRows(mode);
  $: tableHealth = tableHealthForMode(mode);
  $: products = mergedStripeRows('products');
  $: prices = mergedStripeRows('prices');
  $: disputes = mergedStripeRows('disputes');
  $: customers = mergedStripeRows('customers');
  $: mergedCustomers = mergeCustomers(customers, authCustomers);
  $: tenantPortals = Array.isArray(adminData.b2b_data) ? adminData.b2b_data : [];
  $: if (mode === 'disputes' && !selectedDispute && disputes.length) selectedDispute = disputes[0].id;
  $: selectedDisputeRow = disputes.find((row) => row.id === selectedDispute) || null;
  $: selectedDraft = disputeDraft(selectedDisputeRow);

  function money(cents, currency = 'eur') {
    const value = Number(cents ?? 0);
    if (!Number.isFinite(value)) return '';
    return `${(value / 100).toFixed(2)} ${String(currency || 'eur').toUpperCase()}`;
  }

  function syncedRows(kind) {
    return Array.isArray(stripe?.[kind]) ? stripe[kind] : [];
  }

  function tableLabel(table = {}) {
    if (!table) return 'Unknown table';
    if (table.ok) return `${table.source || 'stripe'} / ${table.table || 'table'} / ${table.via || 'direct'}`;
    return table.error || 'Stripe table not visible';
  }

  function tableHealthForMode(kind) {
    if (kind === 'transactions') return transactionHealth();
    return health.tables?.[healthKeys[kind] || kind] || null;
  }

  function transactionHealth() {
    const entries = transactionHealthKeys
      .map((key) => ({ key, ...(health.tables?.[key] || {}) }))
      .filter((entry) => entry.key && (entry.ok || entry.error || entry.table));
    if (!entries.length) return null;

    const okEntries = entries.filter((entry) => entry.ok);
    const first = okEntries[0] || entries.find((entry) => entry.error) || entries[0];
    const source = [...new Set(okEntries.map((entry) => entry.source).filter(Boolean))].join(', ');
    const table = okEntries.map((entry) => entry.table || entry.key).filter(Boolean).join(' + ');

    return {
      ok: okEntries.length > 0,
      source: source || first.source,
      table: table || first.table || first.key,
      via: okEntries.length > 1 ? 'aggregate' : first.via,
      error: okEntries.length ? null : first.error,
      code: okEntries.length ? null : first.code
    };
  }

  function mergedStripeRows(kind) {
    const map = new Map();
    for (const row of [...(localStripeRows[kind] || []), ...syncedRows(kind)]) {
      const key = row.id || row.object?.id || JSON.stringify(row);
      if (!map.has(key)) map.set(key, row);
    }
    return [...map.values()];
  }

  function createdStripeRow(row = {}, kind = 'row') {
    const object = row.object && typeof row.object === 'object' ? row.object : row;
    return {
      id: row.id || object.id,
      kind,
      name: row.name || row.description || object.name || object.description || row.id || object.id,
      email: row.email || object.email || object.customer_email || object.customer_details?.email || '',
      customer: typeof row.customer === 'string' ? row.customer : (row.customer?.id || object.customer?.id || object.customer || ''),
      status: row.status || object.status || row.payment_status || object.payment_status || 'pending_sync',
      amount: row.amount || row.amount_total || row.unit_amount || object.amount || object.amount_total || object.unit_amount,
      currency: row.currency || object.currency || 'eur',
      created_at: row.created ? new Date(row.created * 1000).toISOString() : new Date().toISOString(),
      url: row.url || row.receipt_url || row.hosted_invoice_url || object.url || object.receipt_url || object.hosted_invoice_url,
      metadata: row.metadata || object.metadata || {},
      object,
      mode: row.metadata?.type || object.metadata?.type || row.type || object.type,
      source: 'stripe_api_pending_sync'
    };
  }

  function rememberCreated(kind, row) {
    localStripeRows = {
      ...localStripeRows,
      [kind]: [row, ...(localStripeRows[kind] || []).filter((item) => item.id !== row.id)]
    };
  }

  function date(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString('et-EE');
  }

  function metaType(row) {
    return row.mode || row.metadata?.type || row.metadata?.customer_type || row.kind;
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function stripeId(row = {}) {
    return row.id || row.customer || row.object?.id || row.object?.customer || row.metadata?.stripe_customer || '';
  }

  function authStripeIds(user = {}) {
    const metadata = { ...(user.app_metadata || {}), ...(user.user_metadata || {}) };
    return [metadata.stripe_customer, metadata.stripe_customer_id, metadata.customer, metadata.customer_id]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  }

  function customerAliases(row = {}) {
    return [
      normalizeEmail(row.email),
      stripeId(row) ? `stripe:${stripeId(row)}` : ''
    ].filter(Boolean);
  }

  function authAliases(user = {}) {
    return [
      normalizeEmail(user.email),
      ...authStripeIds(user).map((id) => `stripe:${id}`)
    ].filter(Boolean);
  }

  function findMergeRow(map, aliases = []) {
    return aliases.map((key) => map.get(key)).find(Boolean) || null;
  }

  function rememberMergeRow(map, row, aliases = []) {
    for (const alias of aliases) map.set(alias, row);
  }

  function mergeCustomers(stripeCustomers = [], authUsers = []) {
    const map = new Map();
    const rows = new Set();

    for (const customer of Array.isArray(stripeCustomers) ? stripeCustomers : []) {
      const aliases = customerAliases(customer);
      const key = aliases[0] || `stripe:${customer.id || rows.size}`;
      const row = findMergeRow(map, aliases) ?? {
        key,
        email: normalizeEmail(customer.email),
        name: customer.name || customer.object?.name || customer.email || customer.id,
        stripe: null,
        auth: null
      };
      row.stripe = customer;
      row.email ||= normalizeEmail(customer.email);
      row.name ||= customer.name || customer.object?.name || customer.email || customer.id;
      rows.add(row);
      rememberMergeRow(map, row, aliases.length ? aliases : [key]);
    }

    for (const user of Array.isArray(authUsers) ? authUsers : []) {
      const aliases = authAliases(user);
      const key = aliases[0] || `auth:${user.id || rows.size}`;
      const row = findMergeRow(map, aliases) ?? {
        key,
        email: normalizeEmail(user.email),
        name: user.user_metadata?.full_name || user.email || user.id,
        stripe: null,
        auth: null
      };
      row.auth = user;
      row.email ||= normalizeEmail(user.email);
      row.name = row.name || user.user_metadata?.full_name || user.email || user.id;
      rows.add(row);
      rememberMergeRow(map, row, aliases.length ? aliases : [key]);
    }

    return [...rows].sort((a, b) => (a.email || a.name || '').localeCompare(b.email || b.name || ''));
  }

  function customerSource(row) {
    if (row.stripe && row.auth) return 'Stripe + Auth';
    if (row.stripe) return 'Only Stripe';
    return 'Only Auth';
  }

  function disputeObject(row = {}) {
    return row.object || row;
  }

  function disputeReason(row = {}) {
    return disputeObject(row).reason || row.metadata?.reason || 'dispute';
  }

  function disputeDue(row = {}) {
    const due = disputeObject(row).evidence_details?.due_by;
    if (!due) return '-';
    return date(due > 9_999_999_999 ? due : due * 1000);
  }

  function dashboardUrl(row = {}) {
    const object = disputeObject(row);
    const prefix = object.livemode ? 'https://dashboard.stripe.com' : 'https://dashboard.stripe.com/test';
    return row.id ? `${prefix}/disputes/${row.id}` : null;
  }

  function productId(product = {}) {
    return product.id || product.object?.id || '';
  }

  function productName(product = {}) {
    return product.name || product.object?.name || productId(product) || 'Product';
  }

  function productDescription(product = {}) {
    return product.description || product.object?.description || product.metadata?.description || '';
  }

  function productImages(product = {}) {
    const images = product.images || product.object?.images || product.metadata?.images;
    if (Array.isArray(images)) return images.filter(Boolean);
    if (typeof images === 'string' && images.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(images);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        return [];
      }
    }
    return typeof images === 'string' && images ? [images] : [];
  }

  function priceProductId(price = {}) {
    const product = price.product ?? price.object?.product ?? price.metadata?.product;
    return typeof product === 'string' ? product : product?.id || '';
  }

  function pricesForProduct(product = {}) {
    const id = productId(product);
    return prices.filter((price) => priceProductId(price) === id);
  }

  function unassignedPrices() {
    const productIds = new Set(products.map(productId).filter(Boolean));
    return prices.filter((price) => !productIds.has(priceProductId(price)));
  }

  function disputeDraft(row = null) {
    if (!row) return null;
    if (!row.id) return null;
    if (!disputeDrafts[row.id]) {
      const evidence = disputeObject(row).evidence || {};
      disputeDrafts[row.id] = {
        customer_name: evidence.customer_name || '',
        customer_email_address: evidence.customer_email_address || row.email || '',
        product_description: evidence.product_description || '',
        service_date: evidence.service_date || '',
        service_documentation: evidence.service_documentation || '',
        customer_communication: evidence.customer_communication || '',
        refund_refusal_explanation: evidence.refund_refusal_explanation || '',
        uncategorized_text: evidence.uncategorized_text || '',
        internal_note: row.metadata?.internal_note || ''
      };
    }
    return disputeDrafts[row.id];
  }

  async function stripeAction(payload) {
    busy = true;
    result = null;
    const response = await fetch('/@_api/admin/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    result = await response.json().catch(() => ({}));
    busy = false;
    if (!response.ok) alert(result.error || 'Stripe action failed');

    if (result.customer) rememberCreated('customers', createdStripeRow(result.customer, 'customer'));
    if (result.product) rememberCreated('products', createdStripeRow(result.product, 'product'));
    if (result.price) rememberCreated('prices', createdStripeRow(result.price, 'price'));
    if (result.subscription) rememberCreated('subscriptions', createdStripeRow(result.subscription, 'subscription'));
    if (result.payment_intent) rememberCreated('transactions', createdStripeRow(result.payment_intent, 'payment_intent'));
    if (result.dispute) rememberCreated('disputes', createdStripeRow(result.dispute, 'dispute'));
    if (result.checkout_session) rememberCreated('transactions', createdStripeRow(result.checkout_session, 'checkout'));
    return result;
  }

  function canExpireCheckout(row = {}) {
    return row.kind === 'checkout' && String(row.id || '').startsWith('cs_') && !['complete', 'expired'].includes(String(row.status || '').toLowerCase());
  }

  function expireCheckout(row) {
    if (!confirm(`Expire checkout session ${row.id}`)) return;
    stripeAction({ action: 'expire_checkout_session', session: row.id });
  }

  function submit(event, payload) {
    event.preventDefault();
    stripeAction(payload);
  }

  async function createProductWithPrice(event) {
    event.preventDefault();
    if (!productDraft.name.trim() || !priceDraft.amount) return;
    const productResult = await stripeAction({ action: 'create_product', ...productDraft });
    const id = productResult.product?.id;
    if (!id) return;
    await stripeAction({ action: 'create_price', ...priceDraft, product: id });
    productDraft = { name: '', description: '' };
    priceDraft = { product: '', amount: 0, currency: 'eur', recurring: false, interval: 'month' };
    document.getElementById('stripe_product_create')?.hidePopover?.();
  }

  async function createSubscription(event) {
    event.preventDefault();
    if (subscriptionDraft.price_mode === 'custom') {
      let product = subscriptionDraft.product;
      if (!product) {
        const productResult = await stripeAction({ action: 'create_product', name: subscriptionDraft.product_name, description: subscriptionDraft.description });
        product = productResult.product?.id || '';
      }
      if (!product) return;
      const priceResult = await stripeAction({
        action: 'create_price', product, amount: subscriptionDraft.amount,
        currency: subscriptionDraft.currency, recurring: true, interval: subscriptionDraft.interval
      });
      subscriptionDraft.price = priceResult.price?.id || '';
      if (!subscriptionDraft.price) return;
    }
    const response = await stripeAction({ action: 'create_subscription', ...subscriptionDraft });
    if (!response.subscription) return;
    subscriptionDraft = {
      customer: '', price: '', plan: 'basic', weekly_limit: 200,
      offer_type: 'public', portal_ids: '', offer_label: '', description: '',
      workspace_enabled: true, ends_on: '', days_until_due: 14,
      price_mode: 'existing', product: '', product_name: '', amount: 0, currency: 'eur', interval: 'month'
    };
  }

  function disputePayload(action, submit = false) {
    const draft = selectedDraft || {};
    return {
      action,
      dispute: selectedDisputeRow.id,
      evidence: {
        customer_name: draft.customer_name,
        customer_email_address: draft.customer_email_address,
        product_description: draft.product_description,
        service_date: draft.service_date,
        service_documentation: draft.service_documentation,
        customer_communication: draft.customer_communication,
        refund_refusal_explanation: draft.refund_refusal_explanation,
        uncategorized_text: draft.uncategorized_text
      },
      metadata: {
        internal_note: draft.internal_note,
        evidence_submit_intent: submit ? 'submit_to_bank' : 'draft'
      }
    };
  }

  function saveDisputeDraft() {
    if (!selectedDisputeRow) return;
    stripeAction(disputePayload('update_dispute', false));
  }

  function submitDisputeEvidence() {
    if (!selectedDisputeRow) return;
    if (!confirm('Submit dispute evidence to Stripe Stripe forwards the response to the bank; you might not be able to amend it after submission.')) return;
    stripeAction(disputePayload('submit_dispute_evidence', true));
  }

  function closeDispute() {
    if (!selectedDisputeRow) return;
    if (!confirm('Accept/close this dispute Stripe treats this as not submitting evidence and the dispute can be lost. This action is irreversible.')) return;
    stripeAction({ action: 'close_dispute', dispute: selectedDisputeRow.id, metadata: { internal_note: selectedDraft.internal_note || '' } });
  }
</script>

<section class="stripe-admin grid gap _5">
  <header class="flex gap _3 _space _wrap _center _y">
    <div class="grid gap _1">
      <small>stripe schema</small>
      <h2>{labels[mode] || 'Stripe'}</h2>
      <p>Data comes from Supabase Stripe Sync tables and keeps customers, products, billing and terminal work in one admin surface.</p>
    </div>
    <div class="stats flex gap _2 _wrap">
      {#if mode === 'products'}<button class="btn _color grid gap _2 _center _y" type="button" popovertarget="stripe_product_create">Create product</button>{/if}
      <span>{customers.length} customers</span>
      <span>{products.length} products</span>
      <span>{mergedStripeRows('subscriptions').length} subscriptions</span>
      <span>{disputes.length} disputes</span>
    </div>
  </header>

  {#if health.first_error}
    <div class="warning-box gap grid">
      <b>Stripe sync note</b>
      <span>{health.first_error.kind}: {health.first_error.message}</span>
    </div>
  {/if}

  {#if mode === 'customers'}
    <form class="tool-panel grid gap _3" onsubmit={(event) => submit(event, { action: 'create_customer', ...customerDraft })}>
      <b>Create Stripe customer</b>
      <div class="grid gap _2 fields">
        <input placeholder="Name / company" bind:value={customerDraft.name}>
        <input type="email" placeholder="email@example.com" bind:value={customerDraft.email}>
        <select bind:value={customerDraft.type}>
          <option value="client">Client</option>
          <option value="company">Company</option>
        </select>
        <button type="submit" disabled={busy} class="grid gap _2 _center _y">Create</button>
      </div>
    </form>
  {:else if mode === 'subscriptions'}
    <form class="tool-panel grid gap _3" onsubmit={createSubscription}>
      <header class="grid gap">
        <b>Create workspace subscription</b>
        <small>Creates a Stripe subscription. Workspace access, weekly credits and assigned tenant visibility are stored in Stripe metadata.</small>
      </header>
      <div class="grid gap _2 fields">
        <label class="grid gap"><span>Stripe customer</span><input required list="subscription-customers" placeholder="Otsi nime või e-posti järgi" bind:value={subscriptionDraft.customer}><datalist id="subscription-customers">{#each mergedCustomers.filter((item) => item.stripe) as item}<option value={stripeId(item.stripe)}>{item.name || item.email} · {item.email}</option>{/each}</datalist></label>
        <label class="grid gap"><span>Hinna allikas</span><select bind:value={subscriptionDraft.price_mode}><option value="existing">Olemasolev Stripe price</option><option value="custom">Loo uus hind siin</option></select></label>
        {#if subscriptionDraft.price_mode === 'existing'}
          <label class="grid gap"><span>Recurring price</span><input required list="subscription-prices" placeholder="Otsi toote nime järgi" bind:value={subscriptionDraft.price}><datalist id="subscription-prices">{#each prices.filter((price) => price.object?.recurring || price.recurring) as price}<option value={price.id}>{productName(products.find((product) => productId(product) === priceProductId(price)))} · {money(price.amount || price.unit_amount, price.currency)}</option>{/each}</datalist></label>
        {:else}
          <label class="grid gap"><span>Stripe product</span><input list="subscription-products" placeholder="Vali olemasolev või jäta tühjaks" bind:value={subscriptionDraft.product}><datalist id="subscription-products">{#each products as product}<option value={productId(product)}>{productName(product)}</option>{/each}</datalist></label>
          <label class="grid gap"><span>Uue toote nimi</span><input required={!subscriptionDraft.product} placeholder="Näiteks Premium Workspace" bind:value={subscriptionDraft.product_name}></label>
          <label class="grid gap"><span>Kuutasu</span><input required type="number" min="0.01" step="0.01" bind:value={subscriptionDraft.amount}></label>
          <label class="grid gap"><span>Valuuta</span><select bind:value={subscriptionDraft.currency}><option value="eur">EUR</option><option value="usd">USD</option></select></label>
          <label class="grid gap"><span>Periood</span><select bind:value={subscriptionDraft.interval}><option value="month">Kuu</option><option value="year">Aasta</option></select></label>
        {/if}
        <label class="grid gap"><span>Workspace plan</span><select bind:value={subscriptionDraft.plan} onchange={(event) => {
          subscriptionDraft.plan = event.currentTarget.value;
          if (subscriptionDraft.plan === 'basic') subscriptionDraft.weekly_limit = 200;
          if (subscriptionDraft.plan === 'premium') subscriptionDraft.weekly_limit = 1000;
          if (subscriptionDraft.plan === 'enterprise') subscriptionDraft.weekly_limit = 'unlimited';
        }}><option value="basic">Basic</option><option value="premium">Premium</option><option value="enterprise">Enterprise</option></select></label>
        <label class="grid gap"><span>Weekly credits</span><input required placeholder="200 / 1000 / unlimited" bind:value={subscriptionDraft.weekly_limit}></label>
        <label class="grid gap"><span>Offer visibility</span><select bind:value={subscriptionDraft.offer_type}><option value="public">Workspace offer</option><option value="assigned">Individual offer</option></select></label>
        <label class="grid gap"><span>Assigned tenant portal IDs</span><input list="subscription-portals" placeholder="Otsi portaali ID järgi; mitu ID-d eralda komaga" bind:value={subscriptionDraft.portal_ids} required={subscriptionDraft.offer_type === 'assigned'}><datalist id="subscription-portals">{#each tenantPortals as portal}<option value={portal.who_id || portal.id || portal.domain}>{portal.domain || portal.client || portal.who_id}</option>{/each}</datalist></label>
        <label class="grid gap"><span>Offer label</span><input placeholder="Individual offer" bind:value={subscriptionDraft.offer_label}></label>
        <label class="grid gap"><span>End date</span><input type="date" bind:value={subscriptionDraft.ends_on}></label>
        <label class="grid gap"><span>Invoice due days</span><input type="number" min="1" max="90" bind:value={subscriptionDraft.days_until_due}><small>Mitu päeva on kliendil pärast Stripe arve väljastamist selle tasumiseks.</small></label>
        <label class="wide grid gap"><span>Description</span><textarea rows="2" bind:value={subscriptionDraft.description}></textarea></label>
        <label class="check flex gap _2 _center _y"><input type="checkbox" bind:checked={subscriptionDraft.workspace_enabled}> <span>Part of Workspace tenant subscriptions</span></label>
        <button type="submit" disabled={busy} class="grid gap _2 _center _y">Create subscription</button>
      </div>
    </form>
  {:else if mode === 'products'}
    <div class="product-console grid gap _3">
      <Popover id="stripe_product_create" width={760} showLanguage={false}>
      <form class="tool-panel grid gap _3" onsubmit={createProductWithPrice}>
        <header class="flex gap _2 _space _wrap _center _y">
          <div>
            <b>Create product</b>
            <small>Create one Stripe catalog product with one price in the same step.</small>
          </div>
          <button class="btn _transparent grid gap _2 _center _y" type="button" popovertarget="stripe_product_create" popovertargetaction="hide">Cancel</button>
        </header>
        <div class="grid gap _2 fields">
          <label class="grid gap"><span>Product name</span><input placeholder="Product name" bind:value={productDraft.name}></label>
          <label class="grid gap"><span>Description</span><input placeholder="Description" bind:value={productDraft.description}></label>
          <label class="grid gap"><span>Amount</span><input type="number" min="0" step="0.01" placeholder="Amount EUR" bind:value={priceDraft.amount}></label>
          <label class="grid gap"><span>Currency</span><select bind:value={priceDraft.currency}><option value="eur">EUR</option><option value="usd">USD</option></select></label>
          <label class="grid gap"><span>Billing mode</span><select value={priceDraft.recurring ? 'recurring' : 'once'} onchange={(event) => priceDraft.recurring = event.currentTarget.value === 'recurring'}>
            <option value="once">One-time</option>
            <option value="recurring">Recurring</option>
          </select></label>
          {#if priceDraft.recurring}
            <label class="grid gap"><span>Interval</span><select bind:value={priceDraft.interval}><option value="month">month</option><option value="year">year</option></select></label>
          {/if}
          <button type="submit" disabled={busy || !productDraft.name.trim() || !priceDraft.amount} class="grid gap _2 _center _y">Create product</button>
        </div>
      </form>
      </Popover>
    </div>
  {:else if mode === 'disputes'}
    <section class="dispute-workbench gap _2 grid">
      <div class="table-wrap dispute-list">
        <table>
          <thead>
            <tr><th>Dispute</th><th>Status</th><th>Reason</th><th>Amount</th><th>Due</th><th>Stripe</th></tr>
          </thead>
          <tbody>
            {#each disputes as row}
              <tr class:active={selectedDispute === row.id} onclick={() => selectedDispute = row.id}>
                <td><b>{row.id}</b><small>{row.customer || row.email || disputeObject(row).charge || '-'}</small></td>
                <td>{row.status || '-'}</td>
                <td>{disputeReason(row)}</td>
                <td>{money(row.amount, row.currency)}</td>
                <td>{disputeDue(row)}</td>
                <td>{#if dashboardUrl(row)}<a href={dashboardUrl(row)} target="_blank" rel="noreferrer">Dashboard</a>{:else}-{/if}</td>
              </tr>
            {:else}
              <tr><td colspan="6">No synced disputes yet.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if selectedDisputeRow && selectedDraft}
        <form class="tool-panel dispute-editor gap _2 grid" onsubmit={(event) => { event.preventDefault(); saveDisputeDraft(); }}>
          <header class="flex gap _2 _space _center _y _wrap">
            <div>
              <small>{selectedDisputeRow.status} · {disputeReason(selectedDisputeRow)}</small>
              <h3>{selectedDisputeRow.id}</h3>
            </div>
            <b>{money(selectedDisputeRow.amount, selectedDisputeRow.currency)}</b>
          </header>

          <div class="warning-box gap grid">
            <b>Evidence is final when submitted</b>
            <p>Save draft stages the evidence in Stripe. Submit sends it to the bank. Close accepts the dispute and can mark it lost.</p>
          </div>

          <div class="grid gap _2 fields evidence-fields">
            <label class="grid gap"><span>Customer name</span><input bind:value={selectedDraft.customer_name}></label>
            <label class="grid gap"><span>Customer email</span><input type="email" bind:value={selectedDraft.customer_email_address}></label>
            <label class="grid gap"><span>Service date</span><input placeholder="2026-07-08 or period" bind:value={selectedDraft.service_date}></label>
            <label class="wide grid gap"><span>Product / service description</span><textarea rows="3" bind:value={selectedDraft.product_description}></textarea></label>
            <label class="wide grid gap"><span>Service documentation</span><textarea rows="3" bind:value={selectedDraft.service_documentation} placeholder="Stripe file ID if uploaded, or keep notes in uncategorized evidence."></textarea></label>
            <label class="wide grid gap"><span>Customer communication</span><textarea rows="3" bind:value={selectedDraft.customer_communication} placeholder="Stripe file ID for uploaded communication evidence."></textarea></label>
            <label class="wide grid gap"><span>Refund refusal / explanation</span><textarea rows="3" bind:value={selectedDraft.refund_refusal_explanation}></textarea></label>
            <label class="wide grid gap"><span>Uncategorized evidence text</span><textarea rows="4" bind:value={selectedDraft.uncategorized_text}></textarea></label>
            <label class="wide grid gap"><span>Internal staff note</span><textarea rows="2" bind:value={selectedDraft.internal_note}></textarea></label>
          </div>

          <div class="dispute-actions flex gap _2 _wrap">
            <button type="submit" disabled={busy} class="grid gap _2 _center _y">Save draft</button>
            <button type="button" disabled={busy} onclick={submitDisputeEvidence} class="grid gap _2 _center _y">Submit evidence</button>
            <button type="button" class="danger grid gap _2 _center _y" disabled={busy} onclick={closeDispute}>Accept / close</button>
          </div>
        </form>
      {:else}
        <article class="record gap _2 grid">
          <small>Disputes</small>
          <strong>No dispute selected</strong>
          <p>Select a dispute to stage evidence, submit the response or accept/close it.</p>
        </article>
      {/if}
    </section>
  {/if}

  {#if mode === 'customers'}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>Email</th>
            <th>Source</th>
            <th>Stripe</th>
            <th>Auth</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each mergedCustomers as row}
            <tr>
              <td><b>{row.name || row.email || 'Client'}</b></td>
              <td>{row.email || '-'}</td>
              <td><span class:warning={!row.stripe || !row.auth} title={row.stripe && row.auth ? 'Leitud nii Stripe Syncist kui workspace Authist' : row.stripe ? 'Ainult Stripe customer, workspace Auth kontot pole' : 'Ainult workspace Auth konto, Stripe customerit pole'}>{customerSource(row)}</span></td>
              <td>{row.stripe?.id || '-'}</td>
              <td>{row.auth?.id || '-'}</td>
              <td>{row.stripe?.status || row.auth?.last_sign_in_at || row.auth?.created_at || '-'}</td>
            </tr>
          {:else}
            <tr><td colspan="6">No Stripe or auth customers yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if mode === 'products'}
    <section class="product-grid gap _2 grid">
      {#each products as product}
        <article class="record product-card gap _2 grid">
          <header class="flex gap _2 _space _wrap _center _y">
            <div>
              <small>{productId(product)}</small>
              <strong>{productName(product)}</strong>
            </div>
            <span>{pricesForProduct(product).length} price</span>
          </header>
          <div class="product-visual">
            {#if productImages(product)[0]}
              <img class="product-image" src={productImages(product)[0]} alt={productName(product)} loading="lazy">
            {:else}
              <div class="product-placeholder grid">{productName(product).slice(0, 2).toUpperCase()}</div>
            {/if}
          </div>
          {#if productDescription(product)}<p>{productDescription(product)}</p>{/if}
          <div class="mini-table gap grid">
            {#each pricesForProduct(product) as price}
              <button type="button" class="grid gap _2 _center _y">
                <b>{price.id}</b>
                <span>{money(price.amount || price.unit_amount, price.currency)} {price.object?.recurring?.interval ? `/ ${price.object.recurring.interval}` : ''}</span>
              </button>
            {:else}
              <small>No prices connected yet.</small>
            {/each}
          </div>
        </article>
      {:else}
        <article class="record gap _2 grid">
          <small>Products</small>
          <strong>No synced products yet</strong>
          <p>Create a Stripe product and its prices will appear grouped here after sync.</p>
        </article>
      {/each}

      {#if unassignedPrices().length}
        <article class="record product-card gap _2 grid">
          <small>Unassigned prices</small>
          <strong>Prices without a visible product</strong>
          <div class="mini-table gap grid">
            {#each unassignedPrices() as price}
              <button type="button" class="grid gap _2 _center _y">
                <b>{price.id}</b>
                <span>{money(price.amount || price.unit_amount, price.currency)}</span>
              </button>
            {/each}
          </div>
        </article>
      {/if}
    </section>
  {:else if mode === 'transactions'}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>ID</th>
            <th>Customer</th>
            <th>Email</th>
            <th>Status</th>
            <th>Amount</th>
            <th>Date</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row}
            <tr>
              <td>{row.kind || '-'}</td>
              <td><b>{row.id}</b></td>
              <td>{row.customer || '-'}</td>
              <td>{row.email || '-'}</td>
              <td>{row.status || '-'}</td>
              <td>{row.amount ? money(row.amount, row.currency) : '-'}</td>
              <td>{date(row.created_at)}</td>
              <td>
                <div class="flex gap _2 _wrap">
                  {#if row.url}<a href={row.url} target="_blank" rel="noreferrer">Open</a>{/if}
                  {#if canExpireCheckout(row)}<button type="button" class="grid gap _2 _center _y" onclick={() => expireCheckout(row)} disabled={busy}>Expire</button>{/if}
                  {#if !row.url && !canExpireCheckout(row)}-{/if}
                </div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="8">No synced transaction rows yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if mode !== 'disputes'}
    <section class="data-grid gap _2 grid">
      {#if mode === 'products' && prices.length}
        <article class="record wide gap _2 grid">
          <small>Prices</small>
          <div class="mini-table gap grid">
            {#each prices as price}
              <button type="button" class="grid gap _2 _center _y">
                <b>{price.id}</b>
                <span>{money(price.amount, price.currency)} {price.object?.recurring?.interval ? `/ ${price.object.recurring.interval}` : ''}</span>
              </button>
            {/each}
          </div>
        </article>
      {/if}

      {#each rows as row}
        <article class="record gap _2 grid">
          <small>{row.kind} · {metaType(row) || 'stripe'}</small>
          <strong>{row.name || row.email || row.id}</strong>
          <p>{row.email || row.customer || row.status || row.id}</p>
          <div class="flex gap _2 _wrap">
            {#if row.amount}<span>{money(row.amount, row.currency)}</span>{/if}
            {#if row.status}<span>{row.status}</span>{/if}
            {#if row.url}<a href={row.url} target="_blank" rel="noreferrer">Open</a>{/if}
          </div>
        </article>
      {:else}
        <article class="record gap _2 grid">
          <small>{labels[mode] || 'Stripe'}</small>
          <strong>No synced rows yet</strong>
          <p>When Stripe Sync has data for this table, it appears here.</p>
        </article>
      {/each}
    </section>
  {/if}

  {#if result}
    <pre>{JSON.stringify(result, null, 2)}</pre>
  {/if}
</section>

<style>
  .stripe-admin {
    width: min(1300px, 100%);
    margin: 0 auto;
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: clamp(24px, 2vw, 34px);
    line-height: 1.05;
    letter-spacing: 0;
  }

  .stats span,
  .record span,
  .record a,
  .table-wrap a {
    border-radius: 999px;
    background: color-mix(in srgb, var(--x_color, #da3) 18%, transparent);
    color: var(--x_color, #da3);
    padding: 5px 9px;
    text-decoration: none;
    font-size: 12px;
    font-weight: 800;
  }

  .tool-panel,
  .record,
  .warning-box {
    border: 1px solid color-mix(in srgb, var(--reverse) 12%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--reverse) 6%, transparent);
    padding: 14px;
  }

  :global(#stripe_product_create .tool-panel) {
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--x_color, #da3) 12%, transparent), transparent 20rem),
      #050505;
    color: var(--reverse, #fff);
    color-scheme: dark;
    padding: clamp(16px, 3vw, 24px);
  }

  :global(#stripe_product_create .fields) {
    grid-template-columns: minmax(0, 1fr);
  }

  :global(#stripe_product_create :is(input, select, textarea)) {
    width: 100%;
    border: 1px solid color-mix(in srgb, var(--reverse, #fff) 16%, transparent);
    background: color-mix(in srgb, var(--reverse, #fff) 7%, transparent);
    color: var(--reverse, #fff);
  }

  .dispute-editor header {    color: color-mix(in srgb, var(--reverse) 72%, transparent);
  }

  .warning-box {    border-color: color-mix(in srgb, #ffcc66 42%, transparent);
    background: color-mix(in srgb, #ffcc66 10%, transparent);
  }

  .fields {
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    align-items: end;
  }

  .fields span {
    font-size: 12px;
    color: color-mix(in srgb, var(--reverse) 68%, transparent);
  }

  .wide {
    grid-column: 1 / -1;
  }

  .data-grid,
  .dispute-workbench {    grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr));
  }

  .product-grid { grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 420px)); justify-content: start; align-items: start; }
  .product-card { width: 100%; max-width: 420px; box-sizing: border-box; }

  .product-console {
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  }

  .product-card {
    position: relative;
    min-height: 240px;
    overflow: hidden;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--x_color, #da3) 12%, transparent), transparent 42%),
      color-mix(in srgb, var(--reverse) 6%, transparent);
  }

  .product-card header {
    align-items: flex-start;
  }

  .product-visual {
    aspect-ratio: 16 / 8;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--reverse) 12%, transparent);
    background: color-mix(in srgb, var(--reverse) 7%, transparent);
  }

  .product-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .product-placeholder {    place-items: center;
    width: 100%;
    height: 100%;
    color: var(--x_color, #da3);
    font-size: 42px;
    font-weight: 900;
    background: radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--x_color, #da3) 22%, transparent), transparent 40%);
  }

  .table-wrap {
    overflow-x: auto;
    border: 1px solid color-mix(in srgb, var(--reverse) 12%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--reverse) 6%, transparent);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 760px;
  }

  th,
  td {
    padding: 12px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--reverse) 10%, transparent);
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
  }

  td {
    color: color-mix(in srgb, var(--reverse) 72%, transparent);
  }

  td b,
  .record strong,
  .dispute-editor h3,
  .dispute-editor b {
    color: var(--reverse);
  }

  td small,
  .record p,
  .warning-box p {
    display: block;
    color: color-mix(in srgb, var(--reverse) 64%, transparent);
    overflow-wrap: anywhere;
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr.active,
  tbody tr:hover {
    background: color-mix(in srgb, var(--reverse) 6%, transparent);
  }

  td span {
    display: inline-flex;
    width: max-content;
    border-radius: 999px;
    background: color-mix(in srgb, var(--x_color, #da3) 18%, transparent);
    color: var(--x_color, #da3);
    padding: 5px 9px;
    font-size: 12px;
    font-weight: 800;
  }

  td span.warning {
    background: #ffffff18;
    color: color-mix(in srgb, var(--reverse) 72%, transparent);
  }

  .record {    align-content: start;
  }

  .record.wide {
    grid-column: 1 / -1;
  }

  .record strong {
    overflow-wrap: anywhere;
  }

  .mini-table button {    grid-template-columns: minmax(0, 1fr) auto;    text-align: left;
  }

  .mini-table b {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .danger {
    color: #ff8b8b;
    border-color: #ff8b8b66;
  }

  @media (max-width: 860px) {
    .dispute-workbench {
      grid-template-columns: 1fr;
    }
  }
</style>
