<script>
  let { card = $bindable(), i18n, saving = false, onSaveCard, onStopCardEdit } = $props();
  const tooLong = $derived((card.title?.length ?? 0) > 160 || (card.description?.length ?? 0) > 2000 || (card.note?.length ?? 0) > 2000);
</script>
<fieldset disabled={saving} class="card-editor grid gap">
  <label class="grid gap">{i18n.cardTitle}<input maxlength="160" bind:value={card.title}></label>
  <label class="grid gap">{i18n.descriptionLabel}<textarea rows="3" aria-label={i18n.descriptionLabel} bind:value={card.description} aria-invalid={(card.description?.length ?? 0) > 2000}></textarea><small class="field-count">{card.description?.length ?? 0} / 2000</small></label>
  <div class="card-grid gap _2 grid"><label class="grid gap">{i18n.start}<input type="date" bind:value={card.starts_at}></label><label class="grid gap">{i18n.end}<input type="date" bind:value={card.ends_at}></label></div>
  <label class="toggle gap _2 flex"><input type="checkbox" bind:checked={card.important}>{i18n.important}</label>
  <label class="grid gap">{i18n.internalNote}<textarea rows="2" aria-label={i18n.internalNote} bind:value={card.note} aria-invalid={(card.note?.length ?? 0) > 2000}></textarea><small class="field-count">{card.note?.length ?? 0} / 2000</small></label>
  {#if tooLong}<p role="alert">{i18n.cardTextLimit}</p>{/if}
  <div class="edit-actions gap _2 flex"><button class="button _primary" disabled={tooLong} onclick={() => onSaveCard?.(card.id)}>{saving ? i18n.saving : i18n.saveCard}</button><button class="button _secondary" onclick={() => onStopCardEdit?.(card.id)}>{i18n.cancel}</button></div>
</fieldset>
<style>.card-editor{border:0;padding:0;margin:0;min-width:0}.field-count{text-align:right;font-variant-numeric:tabular-nums}textarea[aria-invalid="true"]{border-color:#b42318}p[role="alert"]{color:#b42318;margin:0}</style>
