<svelte:options runes={false} />
<script>
  export let months = []; // [ [ "2026-03", {income:..., billed:..., items: [...] } ], ... ]
  export let width = 800;
  export let height = 160;
  export let padding = 20; // kogu SVG padding
  export let onBarClick = month => {};

  const BAR_WIDTH = 18;
  const GAP = 30;
  const SIDE_PADDING = 5;

  // leiame kõrgeima väärtuse tulpadest
  $: maxValue = months.length
    ? Math.max(...months.map(([_, d]) => Math.max(d.income, d.billed)))
    : 1;

  // automaatne legendi arvutus
  function computeLegend(maxVal) {
    const stepSize = maxVal <= 1000 ? 50 : 100;
    const maxLegend = Math.ceil(maxVal / stepSize) * stepSize;
    const step = maxLegend / 4;
    return Array.from({ length: 5 }, (_, i) =>
      Math.round((step * i) / stepSize) * stepSize
    );
  }

  $: legends = computeLegend(maxValue);
</script>

<svg width={width} height={height + 40}>
  <!-- Grid lines + legend -->
  {#each [...new Set(legends)] as value, i}
    {@const y = padding + height - (value / legends[4]) * height}
    <line
      x1={padding}
      x2={width - padding}
      y1={y}
      y2={y}
      stroke="#555"
      stroke-width={i === 0 ? 1.5 : 1}
      stroke-dasharray={i === 0 ? "0" : "3,3"}
    />
    <text
      x={padding - 5}
      y={y + 4}
      font-size="10"
      text-anchor="end"
      fill="currentColor"
    >
      {value}
    </text>
  {/each}

  <!-- Bars -->
  <!-- svelte-ignore a11y_positive_tabindex -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  {#each months as [month, data], i}
    {@const baseX = padding + SIDE_PADDING + i * (BAR_WIDTH*2 + GAP)}

    <!-- Roheline (income) -->
    {@const incomeHeight = (data.income / legends[4]) * height}
    {@const incomeY = padding + height - incomeHeight}

    <rect
      x={baseX}
      y={incomeY}
      width={BAR_WIDTH}
      height={incomeHeight}
      fill="green"
      style="cursor:pointer"
      role="button"
      tabindex="2"
      on:click={() => onBarClick(month)}
    />

    <!-- Kollane (billed) -->
    {@const billedHeight = (data.billed / legends[4]) * height}
    {@const billedY = padding + height - billedHeight}

   
    <rect
      x={baseX + BAR_WIDTH}
      y={billedY}
      width={BAR_WIDTH}
      height={billedHeight}
      fill="gold"
      style="cursor:pointer"
      role="button"
      tabindex="3"
      on:click={() => onBarClick(month)}
    />

    <!-- Kuu label -->
    <text
      x={baseX + BAR_WIDTH}
      y={padding + height + 15}
      text-anchor="middle"
      font-size="10"
      fill="currentColor"
    >
      {month}
    </text>
  {/each}
</svg>
