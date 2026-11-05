<svelte:options runes={false} />
<script>
  import MetadataEdit from '$lib/paths/supabase/admin/metadata_edit.svelte';
  export let selectedUser = null;
  export let selectedStripe = null;
  export let stripeForm = {};
  export let stripeStatus = '';
  export let saveStripeCustomer = () => {};
  export let close = () => {};
</script>

<section class="metadata-panel gap _3 grid">
  <header class="flex gap _2 _space _wrap">
    <div><h3>{selectedUser?.email || selectedStripe?.email || selectedStripe?.id}</h3><small>{selectedUser?.id || selectedStripe?.id}</small></div>
    <button type="button" on:click={close}>Sulge</button>
  </header>
  {#if selectedUser}<MetadataEdit users={[selectedUser]} />{/if}
  {#if selectedStripe}
    <section class="stripe-editor gap _2 grid">
      <header class="flex gap _2 _space _wrap"><div><h3>Stripe customer</h3><small>{selectedStripe.id}</small></div>{#if stripeStatus}<small>{stripeStatus}</small>{/if}</header>
      <div class="field-grid gap _2 grid">
        <label><span>Nimi</span><input bind:value={stripeForm.name}></label>
        <label><span>Email</span><input type="email" bind:value={stripeForm.email}></label>
        <label><span>Telefon</span><input bind:value={stripeForm.phone} placeholder="+372 ..."></label>
        <label><span>Aadress</span><input bind:value={stripeForm.address} placeholder="Tänav, linn, postiindeks"></label>
        <label><span>Kirjeldus</span><input bind:value={stripeForm.description}></label>
        <label><span>Tax exempt</span><select bind:value={stripeForm.tax_exempt}><option value="none">none</option><option value="exempt">exempt</option><option value="reverse">reverse</option></select></label>
        <label><span>Preferred locales</span><input bind:value={stripeForm.preferred_locales} placeholder="et, en"></label>
      </div>
      <label><span>metadata JSON</span><textarea class="json-box" bind:value={stripeForm.metadata} spellcheck="false"></textarea></label>
      <button type="button" on:click={saveStripeCustomer}>Salvesta Stripe customer</button>
    </section>
  {/if}
</section>

<style>
  .metadata-panel{padding:18px;background:#080808;color:#eee;text-align:left}.metadata-panel>header{align-items:start}h3{margin:0}small{color:#aaa}
  .stripe-editor{border-top:1px solid #222;padding-top:16px}.field-grid{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
  label{display:grid;gap:6px;min-width:0}:is(input,select,textarea){width:100%;min-width:0;box-sizing:border-box}.json-box{min-height:150px;font:12px ui-monospace,SFMono-Regular,Consolas,monospace}
</style>
