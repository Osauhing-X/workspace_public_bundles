<script>
  let { i18n, reminder = $bindable(), saving = false, onSave, onCancel } = $props();
</script>

<article class="box _outer reminder-panel grid gap _3">
  <header class="flex gap _2 _space _center _y _wrap">
    <div>
      <span>{i18n.reminder}</span>
      <h2>{reminder.id ? 'Edit reminder' : i18n.addReminder}</h2>
    </div>
  </header>
  <div class="grid gap _3">
    <label class="grid gap">
      {i18n.titleField}
      <input bind:value={reminder.title} placeholder="Call supplier" required>
    </label>
    <label class="grid gap">
      {i18n.dateTime}
      <input type="datetime-local" bind:value={reminder.starts_at} required>
    </label>
    <label class="grid gap">
      {i18n.note}
      <textarea rows="4" bind:value={reminder.note} placeholder="Context for the team"></textarea>
    </label>
    <button type="button" class="button _primary" disabled={saving} onclick={onSave}>{saving ? 'Saving...' : reminder.id ? 'Save changes' : i18n.add}</button>
    {#if reminder.id}<button type="button" class="button _secondary" onclick={onCancel}>Cancel edit</button>{/if}
  </div>
</article>

<style>

  .reminder-panel {
    padding: 18px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
  }

  span {
    color: #667085;
  }

  label {    color: #344054;
    font-size: 13px;
  }

  input,
  textarea {
    min-width: 0;
    border: 1px solid #d0d5dd;
    border-radius: 6px;
    background: #fff;
    padding: 10px 11px;
    font: inherit;
  }

  button:disabled {
    opacity: .55;
    cursor: not-allowed;
  }
</style>
