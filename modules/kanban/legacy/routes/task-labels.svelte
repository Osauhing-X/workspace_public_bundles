<script>
  import { tagKey } from '../../ui/tags.js';
  let { tags = [], onSelect, i18n, disabled = false } = $props();
  function tone(tag) { return [...tagKey(tag)].reduce((sum, character) => (sum * 31 + character.codePointAt(0)) % 6, 0); }
</script>
{#if tags.length}<div class="task-labels" aria-label={i18n.labels}>{#each tags as tag}<button type="button" {disabled} class="task-label" data-tone={tone(tag)} onclick={() => onSelect?.(tagKey(tag))} aria-label={`${i18n.filterLabel}: ${tag}`}>{tag}</button>{/each}</div>{/if}
<style>
  .task-labels{display:flex;flex-wrap:wrap;gap:5px;min-width:0}.task-label{font:600 11px/1.4 system-ui;padding:3px 8px;border:1px solid #b8cce2;border-radius:999px;color:#244a70;background:#eaf2fa;max-width:100%;overflow-wrap:anywhere;cursor:pointer}
  .task-label[data-tone="1"]{color:#5b3e86;background:#f1ebfa;border-color:#d7c6eb}.task-label[data-tone="2"]{color:#246047;background:#e9f6ef;border-color:#bddfc9}.task-label[data-tone="3"]{color:#875715;background:#fff4dc;border-color:#ebd39e}.task-label[data-tone="4"]{color:#874b64;background:#faedf3;border-color:#e7c8d5}.task-label[data-tone="5"]{color:#3b5c63;background:#eaf3f5;border-color:#bdd5dc}.task-label:focus-visible{outline:2px solid currentColor;outline-offset:2px}.task-label:disabled{cursor:default;opacity:.65}
</style>
