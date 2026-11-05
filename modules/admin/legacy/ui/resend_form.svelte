<svelte:options runes={false} />
<script>
  import { tick } from 'svelte'
  import { mail_html } from '$lib/paths/resend/html_builder.js'
  import { mail_draft } from '$lib/site/modules/admin/context.js'

  import { object } from '$lib/paths/resend/store.js';


  import list from '$lib/paths/resend/templates/list.json'
  let template = list[0]
  $: is_html = mail_html(template, $object)




  let bcc = false, resend = {
    from: 'Taavi <taavi@extaas.com>',
		to: null,
		subject: null,
		replyTo: 'mail@extaas.com',
		tags: [
			{ name: "Extaas", value: "extaas" },
			{ name: "OU_X", value: "ou_x" } ],
  }
  let directText = ''
  let sendStatus = ''
  let appliedDraft = null

  $: if ($mail_draft && $mail_draft !== appliedDraft) {
    appliedDraft = $mail_draft
    resend.to = $mail_draft.to
    resend.subject = $mail_draft.subject
    directText = $mail_draft.text
    template = 'contact'
    $object = {
      to: $mail_draft.to,
      subject: $mail_draft.subject,
      text: $mail_draft.text,
      source: $mail_draft.source
    }
  }

  async function sendDirect() {
    if (!resend.to || !resend.subject || !directText) return alert('Täida saaja, teema ja sisu.');
    if (!confirm(`Saada kiri aadressile ${resend.to}`)) return;

    sendStatus = 'Saadan...'
    const response = await fetch('/@_resend/our_domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        what: 'direct',
        to: resend.to,
        subject: resend.subject,
        text: directText
      })
    })

    sendStatus = response.ok ? 'Saadetud' : 'Saatmine ebaõnnestus'
  }




  let container, shadow, show_html = false

  async function make_shadow(){
    await tick()

    if (!container) return

    if (container && !container.shadowRoot) {
      shadow = container.attachShadow({ mode: 'open' }) }
    else {
      shadow = container.shadowRoot }
    
    shadow.innerHTML = is_html.replaceAll(
      'src="cid:name"',
      'src="/corporate_visual_identity/name.png"') }

  $: if (!show_html || !show_object || !show_resend || template) make_shadow()




  let show_object = false
  let new_object = null


  let show_resend = false
  let new_resend = null
</script>


<section class="flex gap _5">
  <div class="grid gap _2" style="margin-top: 2em;">
    <select bind:value={template} on:input={() => $object = {}}>
      {#each list as template}
        <option value={template}>
          {template}</option>
      {/each}
    </select>
    
    <hr class="full_width">
    <label class="grid gap">Subject<input bind:value={resend.subject} type="text"></label>

    <label class="grid gap">From
      <input bind:value={resend.from} type="text"></label>

    <label class="grid gap">To<input bind:value={resend.to} type="email"></label>

    <label class="grid gap">Message
      <textarea bind:value={directText} rows="7"></textarea>
    </label>

    <button type="button" on:click={sendDirect} disabled={!resend.to || !resend.subject || !directText}>
      Send direct email
    </button>
    {#if sendStatus}<small>{sendStatus}</small>{/if}

    

    <hr class="full_width">

    <details class="grid gap _2" open>
      <div class="grid gap _2">
        <label class="flex gap _space _center _y" null>
      <b>RESEND</b>
      <input type="checkbox" disabled={show_object || show_html} bind:checked={show_resend} on:input={(v) => {
        if(!v.target.checked){
        // Compare
          let not_same = JSON.stringify(resend, null, 2) != new_resend
          if( not_same && confirm("Update")){ resend = JSON.parse(new_resend) }
        // Reset
          new_resend = null }}}>
    </label>

    <label class="flex gap _space _center _y" null>
      <b>HTML</b>
      <input type="checkbox" disabled={show_object || show_resend} bind:checked={show_html}>
    </label>

    <label class="flex gap _space _center _y" null>
      <b>OBJECT</b>
      <input type="checkbox" disabled={show_html || show_resend} bind:checked={show_object} on:input={(v) => {
        if(!v.target.checked){
        // Compare
          let not_same = JSON.stringify($object, null, 2) != new_object
          if( not_same && confirm("Update")){ $object = JSON.parse(new_object) }
        // Reset
          new_object = null }}}>
    </label>

    <hr class="full_width">

        <label class="grid gap">ReplyTo<input bind:value={resend.replyTo} type="email"></label>

        <label class="grid gap">Bcc
          <div class="flex gap _2">
            <input type="checkbox" bind:checked={bcc} null on:change={(v)=> {
              if(!v.target.checked) resend.bcc = null
              else resend.bcc = "taavi@extaas.com"}}>
            <input bind:value={resend.bcc} type="email" disabled={!bcc} style="width: 150px;"> </div> </label>
      </div>
      

        
    </details>
    
  </div>
    {#if show_html && !show_object && !show_resend}
      <textarea bind:value={is_html} style="height: 700px;">{is_html}</textarea>

    {:else if show_object && !show_html && !show_resend}
      <textarea bind:value={new_object} style="height: 700px;">{JSON.stringify($object, null, 2)}</textarea>

    {:else if show_resend && !show_html && !show_object}
      <textarea bind:value={new_resend} style="height: 700px;">{JSON.stringify(resend, null, 2)}</textarea>

    {:else}
      <div bind:this={container}></div>
    {/if}
</section>



<style>
  label:not([null]) {
    max-width: 200px;  }
</style>
