<script>
  let { i18n, onAddBoard } = $props();
</script>

<section class="box _outer empty gap _2 grid">
  <span>{i18n.emptyEyebrow}</span>
  <h2>{i18n.emptyTitle}</h2>
  <p>{i18n.emptyDescription}</p>
  <button class="button _primary" onclick={onAddBoard}>{i18n.addBoard}</button>
</section>
