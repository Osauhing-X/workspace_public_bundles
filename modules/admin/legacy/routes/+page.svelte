<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import Header from '$lib/components/header/import.svelte';

  let { data = {} } = $props();
  const overview = $derived(data.staff_tenant_overview ?? {});
  const portal = $derived(overview.portal ?? {});
  const errorCount = $derived((overview.issues ?? []).filter((item) => item.level === 'error').length);
  const warningCount = $derived((overview.issues ?? []).filter((item) => item.level !== 'error').length);
  const requiredIntegrations = $derived((overview.integrations ?? []).filter((item) => item.required));
  const readyRequiredIntegrations = $derived(requiredIntegrations.filter((item) => item.configured).length);
  const availableModules = $derived(Object.values(overview.module_entitlements ?? {}).filter((item) => item.allowed).length);
  const healthScore = $derived(Math.max(0, 100 - errorCount * 25 - warningCount * 10));

  function routeHref(path = '/') {
    const hosted = $page.url.pathname.match(/^\/t\/[^/]+/)?.[0];
    return hosted ? `${hosted}${path}` : path;
  }

  function date(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('et-EE');
  }

  function entitlementLabel(value = {}) {
    if (value.allowed) return value.source === 'admin' ? 'Staff access' : 'Available';
    if (value.reason === 'active_plan_required') return 'Plan required';
    if (value.reason === 'plan_upgrade_required') return `${value.required_plan ?? 'Higher'} plan required`;
    return 'Not assigned';
  }
</script>

<Header>
  {#snippet slot_main()}
    <div class="title grid gap">
      <b>Tenant health overview</b>
      <span>{portal.name || portal.domain || portal.key || 'Tenant portal'}</span>
    </div>
  {/snippet}
  {#snippet slot_btns()}
    <button class="back grid gap _2 _center _y" onclick={() => goto(routeHref('/workspace?tab=modules'))}>Back</button>
  {/snippet}
</Header>

<main class="grid gap _3">
  <section class="hero box _outer grid gap _3">
    <div class="flex _space _center _y gap _3 _wrap">
      <div>
        <span>Extaas staff tool</span>
        <h1>{portal.name || 'Unnamed tenant'}</h1>
        <p>Quick operational view of ownership, configuration, integrations and detected problems.</p>
      </div>
      <div class="score grid _center _y" class:ok={healthScore >= 80} class:warn={healthScore < 80 && healthScore >= 50} class:bad={healthScore < 50}><strong>{healthScore}</strong><small>health score</small></div>
    </div>
    <div class="facts">
      <article><small>Critical</small><strong class:error-text={errorCount}>{errorCount}</strong></article>
      <article><small>Warnings</small><strong class:warning-text={warningCount}>{warningCount}</strong></article>
      <article><small>Required integrations</small><strong>{readyRequiredIntegrations} / {requiredIntegrations.length}</strong></article>
      <article><small>Available modules</small><strong>{availableModules}</strong></article>
    </div>
    <nav class="quick-actions flex gap _2 _wrap">
      <a class="button _secondary" href={routeHref('/workspace?tab=settings')}>Portal settings</a>
      <a class="button _secondary" href={routeHref('/workspace?tab=integrations')}>Integrations</a>
      <a class="button _secondary" href={routeHref('/workspace?tab=modules')}>Tenant modules</a>
      <span>Last checked {date(overview.checked_at)}</span>
    </nav>
  </section>

  <section class="attention-table box _outer grid gap _2">
    <header><span>Identity and routing</span><h2>Portal details</h2><p>Portal identity, ownership and active routing configuration.</p></header>
    <div class="table-wrap"><table>
      <thead><tr><th>Setting</th><th>Value</th><th>State</th></tr></thead>
      <tbody>
        <tr><td><b>Portal UUID</b></td><td><code>{portal.id || '—'}</code></td><td><span class="kind neutral">Identifier</span></td></tr>
        <tr><td><b>Owner</b></td><td>{portal.owner || 'Not assigned'}</td><td><span class:urgent={!portal.owner} class="kind">{portal.owner ? 'Connected' : 'Missing'}</span></td></tr>
        <tr><td><b>Hosted route</b></td><td><code>{portal.who_id ? `/t/${portal.who_id}` : '—'}</code></td><td><span class="kind neutral">Extaas route</span></td></tr>
        <tr><td><b>Custom domain</b></td><td>{portal.domain || 'Not configured'}</td><td><span class="kind neutral">{portal.domain ? 'Configured' : 'Optional'}</span></td></tr>
        <tr><td><b>DNS verification</b></td><td>{portal.domain || 'No custom domain'}</td><td><span class:urgent={portal.domain && !portal.dns_verified} class:success={portal.domain && portal.dns_verified} class="kind">{portal.domain ? (portal.dns_verified ? 'Verified' : 'Pending') : 'Not required'}</span></td></tr>
        <tr><td><b>Last update</b></td><td>{date(portal.updated_at)}</td><td><span class="kind neutral">Recorded</span></td></tr>
      </tbody>
    </table></div>
  </section>

  <section class="box _outer grid gap _3">
    <header><span>Secrets are never displayed</span><h2>Integrations and keys</h2></header>
    <div class="integration-grid">
      {#each overview.integrations ?? [] as integration}
        <article class="integration grid gap _2">
          <div class="flex _space _center _y gap _2"><b>{integration.name}</b><span class:good={integration.configured} class:bad={integration.required && !integration.configured} class:neutral={!integration.required && !integration.configured} class="badge">{integration.configured ? 'Configured' : integration.required ? 'Required · incomplete' : 'Optional'}</span></div>
          <p>{integration.detail}</p>
          <ul>
            {#each Object.entries(integration.keys ?? {}) as [key, present]}
              <li><code>{key}</code><span class:good={present} class:bad={!present} class="badge">{present ? 'Present' : 'Missing'}</span></li>
            {/each}
          </ul>
          <a class="manage-link" href={routeHref(integration.href)}>Review integration</a>
        </article>
      {/each}
    </div>
  </section>

  <section class="box _outer grid gap _3">
    <header class="flex _space _bottom gap _2"><div><span>Recipients and responsibilities</span><h2>Access and notification emails</h2></div><a class="button _secondary" href={routeHref('/workspace?tab=settings')}>Manage settings</a></header>
    <div class="split">
      <div class="grid gap _2">
        <h3>Portal access</h3>
        <div class="list">
          {#each overview.access ?? [] as email}<article><b>{email}</b></article>{:else}<article><b>No access emails assigned</b></article>{/each}
        </div>
      </div>
      <div class="grid gap _2">
        <h3>Notifications</h3>
        <div class="list">
          {#each overview.notifications ?? [] as item}
            <article class="grid gap"><div class="flex _space gap _2"><b>{item.source}</b><span class:good={item.enabled && item.emails.length} class:bad={item.enabled && !item.emails.length} class="badge">{item.enabled ? (item.emails.length ? 'Connected' : 'No recipient') : 'Disabled'}</span></div><small>{item.emails.length ? item.emails.join(', ') : item.error || '—'}</small></article>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section class="content-group box _outer grid gap _2">
    <header class="flex _space _bottom gap _2"><div><span>Configuration inventory</span><h2>Modules and resources</h2></div><a class="button _secondary" href={routeHref('/workspace?tab=modules')}>Open modules</a></header>
    <div class="table-wrap"><table>
      <thead><tr><th>Module</th><th>Required plan</th><th>State</th></tr></thead>
      <tbody>{#each Object.entries(overview.module_entitlements ?? {}) as [module, entitlement]}<tr><td><b>{module}</b></td><td>{entitlement.required_plan || 'assigned'}</td><td>{entitlementLabel(entitlement)}</td></tr>{/each}</tbody>
    </table></div>
    <details><summary>Provisioned resource markers ({overview.resources?.length ?? 0})</summary><div class="resource-list">{#each overview.resources ?? [] as resource}<code>{resource}</code>{:else}<span>No resource markers</span>{/each}</div></details>
  </section>

  <section class="box _outer grid gap _3">
    <header><span>Operational checks</span><h2>Problems and recent attention</h2></header>
    <div class="issue-list">
      {#each [...(overview.issues ?? [])].sort((a, b) => Number(b.level === 'error') - Number(a.level === 'error')) as issue}<article class:error={issue.level === 'error'}><div class="flex _space gap _2"><b>{issue.source}</b><span class="severity">{issue.level === 'error' ? 'Critical' : 'Warning'}</span></div><p>{issue.message}</p></article>{:else}<article class="clear"><b>Everything looks consistent</b><p>No configuration problem was detected by the current checks.</p></article>{/each}
      {#each overview.attention ?? [] as item}<article><b>{item.label}: {item.title}</b><p>{item.description || 'Tenant action is required.'}</p></article>{/each}
    </div>
  </section>
</main>

<style>
  main{width:min(1120px,100%);margin:0 auto;padding:24px 16px 56px}section{padding:18px}h1,h2,h3,p{margin:0}header span,.title span,.hero>div>div>span,small{color:#667085;font-size:12px}.hero p,.integration p{margin-top:5px;color:#667085}.facts,.integration-grid,.split{display:grid;gap:12px}.facts{grid-template-columns:repeat(4,minmax(0,1fr))}.facts article,.integration,.list article,.issue-list article{border:1px solid #eaecf0;border-radius:7px;background:#fcfcfd;padding:12px}.facts small,.facts strong{display:block}.facts strong{margin-top:4px;overflow-wrap:anywhere}.integration-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.integration ul{display:grid;gap:7px;margin:0;padding:0;list-style:none}.integration li{display:flex;justify-content:space-between;gap:12px}.split{grid-template-columns:1fr 1fr}.list,.issue-list{display:grid;gap:8px}.badge,.health{width:max-content;border:1px solid #d0d5dd;border-radius:999px;background:#f2f4f7;color:#475467;padding:4px 8px;font-size:12px;font-weight:800}.badge.good,.health.ok{border-color:#abefc6;background:#ecfdf3;color:#067647}.badge.bad,.health.warn{border-color:#fecdca;background:#fff1f3;color:#b42318}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:transparent}th,td{border-bottom:1px solid #eaecf0;background:transparent!important;padding:11px 10px;text-align:left;vertical-align:top}th{color:#667085!important;font-size:12px}code{overflow-wrap:anywhere}.resource-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.resource-list code{border-radius:5px;background:#f2f4f7;padding:5px 7px}.issue-list article{border-left:4px solid #f79009}.issue-list article.error{border-left-color:#d92d20}.issue-list article.clear{border-left-color:#17b26a}.issue-list p{margin-top:4px;color:#667085}@media(max-width:760px){.facts,.integration-grid,.split{grid-template-columns:1fr}}
  .score{min-width:92px;min-height:76px;border:1px solid #d0d5dd;border-radius:9px;background:#f8fafc;text-align:center}.score strong{font-size:28px;line-height:1}.score.ok{border-color:#abefc6;background:#ecfdf3;color:#067647}.score.warn{border-color:#fedf89;background:#fffaeb;color:#b54708}.score.bad{border-color:#fecdca;background:#fff1f3;color:#b42318}.error-text{color:#b42318}.warning-text{color:#b54708}.quick-actions{align-items:center;border-top:1px solid #eaecf0;padding-top:14px}.quick-actions span{margin-left:auto;color:#667085;font-size:12px}.badge.neutral{border-color:#d0d5dd;background:#f2f4f7;color:#475467}.manage-link{width:max-content;margin-top:auto;color:#344054;font-size:12px;font-weight:800}.severity{border-radius:999px;background:#fffaeb;color:#b54708;padding:3px 7px;font-size:11px;font-weight:800}.issue-list article.error .severity{background:#fff1f3;color:#b42318}@media(max-width:600px){.quick-actions span{width:100%;margin-left:0}}
  .box._outer.content-group{overflow:hidden;padding:0}.content-group>header{padding:18px 18px 0}.content-group>.table-wrap{overflow-x:auto}.content-group table{width:100%;min-width:720px;border-collapse:collapse}.content-group th,.content-group td{padding:12px 10px;border-bottom:1px solid var(--override-border,#eaecf0);background:transparent!important;text-align:left;vertical-align:top}.content-group th{color:var(--override-muted,#667085)!important;white-space:nowrap}.content-group tbody tr:hover{background:var(--override-box,#f2f4f7)}.content-group>details{margin:0 18px 18px}
  .box._outer.attention-table{overflow:hidden;padding:0}.attention-table>header{padding:18px 18px 0}.attention-table>header>span{font-weight:700;text-transform:uppercase;letter-spacing:.04em}.attention-table>header p{margin-top:5px;color:#667085}.attention-table>.table-wrap{overflow-x:auto}.attention-table table{width:100%;min-width:720px;border-collapse:collapse}.attention-table th,.attention-table td{padding:12px 10px;border-bottom:1px solid #eaecf0;background:transparent!important;text-align:left;vertical-align:top}.attention-table th{white-space:nowrap}.attention-table tbody tr:hover{background:#f9fafb}.attention-table td:first-child b{display:block;margin-bottom:5px}.kind{display:inline-flex;width:fit-content;border-radius:999px;padding:3px 8px;background:#fffaeb;color:#b54708;font-size:12px;font-weight:700}.kind.neutral{background:#f2f4f7;color:#475467}.kind.success{background:#ecfdf3;color:#067647}.kind.urgent{background:#fff1f3;color:#c01048}
</style>
