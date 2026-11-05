<script>
  let { card = $bindable(), i18n, saving = false, onSaveCard, onStopCardEdit } = $props();
</script>
<fieldset disabled={saving} class="card-editor grid gap">
  <label class="grid gap">{i18n.cardTitle}<input bind:value={card.title}></label>
  <label class="grid gap">{i18n.descriptionLabel}<textarea rows="3" bind:value={card.description}></textarea></label>
  <div class="card-grid gap _2 grid"><label class="grid gap">{i18n.start}<input type="date" bind:value={card.starts_at}></label><label class="grid gap">{i18n.end}<input type="date" bind:value={card.ends_at}></label></div>
  <label class="toggle gap _2 flex"><input type="checkbox" bind:checked={card.important}>{i18n.important}</label>
  <label class="grid gap">{i18n.internalNote}<textarea rows="2" bind:value={card.note}></textarea></label>
  <div class="edit-actions gap _2 flex"><button class="button _primary" onclick={() => onSaveCard?.(card.id)}>{saving ? i18n.saving : i18n.saveCard}</button><button class="button _secondary" onclick={() => onStopCardEdit?.(card.id)}>{i18n.cancel}</button></div>
</fieldset>
<style>.card-editor{border:0;padding:0;margin:0;min-width:0}</style>
