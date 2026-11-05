<script>
  import { onMount } from 'svelte';

  let {
    customers = [],
    companies = [],
    activities = [],
    settings = {},
    selectedType = 'customer',
    selectedId = '',
    onSelect,
    onActivityFilter,
    onOpenSource
  } = $props();

  let canvas;
  let nodes = [];
  let links = [];
  let pointerStart = null;
  let clickTimer = null;
  let hoverNodeId = null;
  let wasPanning = false;
  let viewport = { x: 0, y: 0, scale: 1 };
  const boxPadding = 5;
  const nodeSize = {
    company: { width: 200, height: 50 },
    customer: { width: 210, height: 50 },
    service: { width: 170, height: 46 }
  };
  const nodeGap = 18;

  const nodeTheme = {
    company: { fill: '#eef2ff', stroke: '#6172f3', text: '#1e1b4b', muted: '#475467' },
    customer: { fill: '#ecfdf3', stroke: '#17b26a', text: '#064e3b', muted: '#475467' },
    service: { fill: '#fff7ed', stroke: '#f79009', text: '#7a2e0e', muted: '#667085' }
  };

  const stageColors = $derived(Object.fromEntries((settings.stages ?? []).map((stage) => [stage.id, stage.color])));
  const selectedCustomer = $derived(customers.find((customer) => customer.id === selectedId));
  const selectedCompany = $derived(companies.find((company) => company.id === selectedId));

  $effect(() => {
    customers;
    companies;
    activities;
    selectedType;
    selectedId;
    draw(true);
  });

  onMount(() => {
    const resize = () => draw(true);
    addEventListener('resize', resize);
    draw(true);
    return () => removeEventListener('resize', resize);
  });

  function emailDomain(value = '') {
    return String(value).toLowerCase().split('@')[1] ?? '';
  }

  function webDomain(value = '') {
    try {
      const url = new URL(value.includes('://') ? value : `https://${value}`);
      return url.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return emailDomain(value);
    }
  }

  function servicesFor(customer = {}) {
    const sourceData = customer.metadata?.source_data ?? {};
    const sources = customer.metadata?.sources ?? [];
    const services = [];
    if (sources.includes('audience')) services.push({ id: `audience:${customer.id}`, source: 'audience', label: 'Audience' });
    if (sourceData.booking) services.push({ id: `booking:${customer.id}`, source: 'booking', label: sourceData.booking.service_name ?? 'Booking' });
    if (sourceData.rent) services.push({ id: `rent:${customer.id}`, source: 'rent', label: sourceData.rent.listing_title ?? 'Rent' });
    return services;
  }

  function relatedCustomers() {
    if (selectedType === 'company' && selectedCompany) {
      const companyDomain = webDomain(selectedCompany.website || selectedCompany.email);
      return customers.filter((customer) => {
        const customerDomain = emailDomain(customer.email);
        return customer.company_id === selectedCompany.id || (companyDomain && customerDomain === companyDomain);
      });
    }

    if (selectedType === 'customer' && selectedCustomer) {
      const domain = emailDomain(selectedCustomer.email);
      return customers.filter((customer) => {
        if (customer.id === selectedCustomer.id) return true;
        return domain && emailDomain(customer.email) === domain;
      });
    }

    return [];
  }

  function buildGraph(width, height) {
    const related = relatedCustomers();
    const center = selectedType === 'company'
      ? selectedCompany
      : selectedCustomer;
    if (!center) return { nodes: [], links: [] };

    const centerNode = {
      id: center.id,
      type: selectedType,
      label: center.name,
      email: center.email || center.website || '',
      x: width / 2,
      y: height / 2,
      radius: 34
    };

    const customerNodes = related
      .filter((customer) => selectedType !== 'customer' || customer.id !== selectedCustomer.id)
      .map((customer, index, list) => {
        const angle = (Math.PI * 2 * index) / Math.max(1, list.length);
        const distance = Math.max(selectedType === 'company' ? 340 : 300, list.length * 72);
        return {
          id: customer.id,
          type: 'customer',
          label: customer.name,
          email: customer.email,
          x: centerNode.x + Math.cos(angle) * distance,
          y: centerNode.y + Math.sin(angle) * distance,
          radius: 25,
          customer
        };
      });

    const companyNode = selectedType === 'customer' && selectedCustomer?.company_id
      ? companies.find((company) => company.id === selectedCustomer.company_id)
      : null;
    const optionalCompany = companyNode
      ? [{
          id: companyNode.id,
          type: 'company',
          label: companyNode.name,
          email: companyNode.email || companyNode.website || '',
          x: centerNode.x - 180,
          y: centerNode.y,
          radius: 27,
          company: companyNode
        }]
      : [];

    const serviceNodes = [];
    const serviceLinks = [];
    const owners = selectedType === 'customer' && selectedCustomer ? [selectedCustomer] : related;
    for (const customer of owners) {
      const sourceNode = customer.id === centerNode.id ? centerNode : customerNodes.find((node) => node.id === customer.id);
      if (!sourceNode) continue;
      for (const service of servicesFor(customer)) {
        const id = `${service.source}:${customer.id}:${service.label}`;
        if (!serviceNodes.some((node) => node.id === id)) {
          const angle = ((serviceNodes.length + 1) * Math.PI * 2) / 7;
          serviceNodes.push({
            ...service,
            id,
            type: 'service',
            email: service.source,
            x: sourceNode.x + Math.cos(angle) * 220,
            y: sourceNode.y + Math.sin(angle) * 220,
            radius: 19
          });
        }
        serviceLinks.push({ from: sourceNode.id, to: id, strength: 'service' });
      }
    }

    const nextNodes = [centerNode, ...optionalCompany, ...customerNodes, ...serviceNodes];
    const nextLinks = [
      ...optionalCompany.map((node) => ({ from: centerNode.id, to: node.id, strength: 'company' })),
      ...customerNodes.map((node) => ({ from: centerNode.id, to: node.id, strength: 'customer' })),
      ...serviceLinks
    ];

    return { nodes: nextNodes, links: nextLinks };
  }

  function boxesOverlap(a, b) {
    return Math.abs(a.x - b.x) < (boxWidth(a) + boxWidth(b)) / 2 + nodeGap
      && Math.abs(a.y - b.y) < (boxHeight(a) + boxHeight(b)) / 2 + nodeGap;
  }

  function hasOverlap(node, placed) {
    return placed.some((item) => boxesOverlap(node, item));
  }

  function nearestFreeNode(node, placed) {
    if (!hasOverlap(node, placed)) return node;

    const step = 34;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 1; index < 900; index += 1) {
      const radius = step * Math.sqrt(index);
      const angle = index * goldenAngle;
      const candidate = {
        ...node,
        x: node.x + Math.cos(angle) * radius,
        y: node.y + Math.sin(angle) * radius
      };
      if (!hasOverlap(candidate, placed)) return candidate;
    }

    return node;
  }

  function spreadOverlaps(nextNodes = []) {
    const [center, ...rest] = nextNodes;
    if (!center) return [];
    const placed = [{ ...center }];
    const ordered = rest
      .map((node, index) => ({ node, index, distance: Math.hypot(node.x - center.x, node.y - center.y) }))
      .sort((a, b) => a.distance - b.distance || a.index - b.index);

    for (const item of ordered) {
      placed.push(nearestFreeNode({ ...item.node }, placed));
    }

    return placed;
  }

  function linkedIdsFor(id) {
    if (!id) return new Set();
    const set = new Set([id]);
    for (const link of links) {
      if (link.from === id) set.add(link.to);
      if (link.to === id) set.add(link.from);
    }
    return set;
  }

  function layoutGraph(nextNodes = [], nextLinks = [], width = 900, height = 460) {
    const output = nextNodes.map((node) => ({ ...node, vx: 0, vy: 0 }));
    const center = output[0];
    if (!center) return [];

    const byId = new Map(output.map((node) => [node.id, node]));
    const iterations = Math.min(280, Math.max(120, 60 + output.length));
    const desired = { company: 290, customer: 340, service: 235 };

    for (let pass = 0; pass < iterations; pass += 1) {
      for (let i = 0; i < output.length; i += 1) {
        for (let j = i + 1; j < output.length; j += 1) {
          const a = output[i];
          const b = output[j];
          const dx = b.x - a.x || .01;
          const dy = b.y - a.y || .01;
          const dist2 = Math.max(100, dx * dx + dy * dy);
          const dist = Math.sqrt(dist2);
          const repel = Math.min(3.6, 22000 / dist2);
          const fx = (dx / dist) * repel;
          const fy = (dy / dist) * repel;
          if (a !== center) {
            a.vx -= fx;
            a.vy -= fy;
          }
          if (b !== center) {
            b.vx += fx;
            b.vy += fy;
          }

          const overlapX = (boxWidth(a) + boxWidth(b)) / 2 + nodeGap - Math.abs(dx);
          const overlapY = (boxHeight(a) + boxHeight(b)) / 2 + nodeGap - Math.abs(dy);
          if (overlapX > 0 && overlapY > 0) {
            const sx = Math.sign(dx) || 1;
            const sy = Math.sign(dy) || 1;
            if (overlapX < overlapY) {
              if (a !== center) a.x -= sx * (overlapX / 2 + .4);
              if (b !== center) b.x += sx * (overlapX / 2 + .4);
            } else {
              if (a !== center) a.y -= sy * (overlapY / 2 + .4);
              if (b !== center) b.y += sy * (overlapY / 2 + .4);
            }
          }
        }
      }

      for (const link of nextLinks) {
        const from = byId.get(link.from);
        const to = byId.get(link.to);
        if (!from || !to) continue;
        const dx = to.x - from.x || .01;
        const dy = to.y - from.y || .01;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const target = desired[link.strength] ?? 310;
        const pull = (dist - target) * (link.strength === 'service' ? .018 : .012);
        const fx = (dx / dist) * pull;
        const fy = (dy / dist) * pull;
        if (from !== center) {
          from.vx += fx;
          from.vy += fy;
        }
        if (to !== center) {
          to.vx -= fx;
          to.vy -= fy;
        }
      }

      for (const node of output) {
        if (node === center) {
          node.x = width / 2;
          node.y = height / 2;
          node.vx = 0;
          node.vy = 0;
          continue;
        }
        node.vx += (width / 2 - node.x) * .0012;
        node.vy += (height / 2 - node.y) * .0012;
        node.vx *= .78;
        node.vy *= .78;
        node.x += node.vx;
        node.y += node.vy;
      }
    }

    return spreadOverlaps(output).map(({ vx, vy, ...node }) => node);
  }

  function fitViewport(width, height, nextNodes = []) {
    if (!nextNodes.length) return { x: 0, y: 0, scale: 1 };
    const bounds = graphBounds(nextNodes, 70);
    const graphWidth = Math.max(1, bounds.maxX - bounds.minX);
    const graphHeight = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min(1, Math.max(.42, Math.min(width / graphWidth, height / graphHeight)));
    return clampViewport({
      scale,
      x: (width - graphWidth * scale) / 2 - bounds.minX * scale,
      y: (height - graphHeight * scale) / 2 - bounds.minY * scale
    }, width, height, nextNodes);
  }

  function graphBounds(nextNodes = nodes, padding = 0) {
    return nextNodes.reduce((box, node) => ({
      minX: Math.min(box.minX, node.x - boxWidth(node) / 2 - padding),
      minY: Math.min(box.minY, node.y - boxHeight(node) / 2 - padding),
      maxX: Math.max(box.maxX, node.x + boxWidth(node) / 2 + padding),
      maxY: Math.max(box.maxY, node.y + boxHeight(node) / 2 + padding)
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  }

  function boxWidth(node) {
    return nodeSize[node.type]?.width ?? nodeSize.customer.width;
  }

  function boxHeight(node) {
    return nodeSize[node.type]?.height ?? nodeSize.customer.height;
  }

  function roundedRect(ctx, x, y, width, height, radius = 3) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function clampAxis(offset, size, min, max, scale) {
    const edgePeek = 30;
    const minOffset = edgePeek - max * scale;
    const maxOffset = size - edgePeek - min * scale;
    return Math.min(maxOffset, Math.max(minOffset, offset));
  }

  function clampViewport(nextViewport, width, height, nextNodes = nodes) {
    if (!nextNodes.length) return nextViewport;
    const bounds = graphBounds(nextNodes, 0);
    const graphWidth = Math.max(1, bounds.maxX - bounds.minX);
    const graphHeight = Math.max(1, bounds.maxY - bounds.minY);
    return {
      ...nextViewport,
      x: clampAxis(nextViewport.x, width, bounds.minX, bounds.maxX, nextViewport.scale),
      y: clampAxis(nextViewport.y, height, bounds.minY, bounds.maxY, nextViewport.scale)
    };
  }

  function draw(reset = false) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, rect.width * ratio);
    canvas.height = Math.max(1, rect.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#fcfcfd';
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (reset) {
      const graph = buildGraph(rect.width, rect.height);
      links = graph.links;
      nodes = layoutGraph(graph.nodes, graph.links, rect.width, rect.height);
      viewport = fitViewport(rect.width, rect.height, nodes);
    }

    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.scale, viewport.scale);

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const focus = hoverNodeId ? linkedIdsFor(hoverNodeId) : null;
    for (const link of links) {
      const from = byId.get(link.from);
      const to = byId.get(link.to);
      if (!from || !to) continue;
      const focused = !focus || (focus.has(from.id) && focus.has(to.id));
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = link.strength === 'service'
        ? `rgba(181,71,8,${focused ? .38 : .09})`
        : `rgba(102,112,133,${focused ? .30 : .07})`;
      ctx.lineWidth = link.strength === 'service' ? 1.6 : 1;
      ctx.stroke();
    }

    for (const activity of activities.filter((item) => !item.done).slice(0, 80)) {
      const to = byId.get(activity.customer_id || activity.company_id);
      if (!to) continue;
      ctx.beginPath();
      ctx.arc(to.x + boxWidth(to) / 2 - 7, to.y - boxHeight(to) / 2 + 7, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f79009';
      ctx.fill();
    }

    for (const node of nodes) {
      const focused = !focus || focus.has(node.id);
      const width = boxWidth(node);
      const height = boxHeight(node);
      const x = node.x - width / 2;
      const y = node.y - height / 2;
      const theme = nodeTheme[node.type] ?? nodeTheme.customer;

      ctx.globalAlpha = focused ? 1 : .3;
      roundedRect(ctx, x, y, width, height, 5);
      ctx.fillStyle = theme.fill;
      ctx.fill();
      ctx.lineWidth = node.id === selectedId ? 2 : 1;
      ctx.strokeStyle = node.id === selectedId ? '#fdb022' : theme.stroke;
      ctx.stroke();

      ctx.fillStyle = theme.text;
      ctx.font = node.type === 'service' ? '600 11px system-ui' : '700 12px system-ui';
      const labelX = x + boxPadding;
      ctx.fillText(String(node.label || 'Untitled').slice(0, node.type === 'service' ? 22 : 28), labelX, y + 19);
      if (node.email && viewport.scale > .62) {
        ctx.fillStyle = theme.muted;
        ctx.font = '11px system-ui';
        ctx.fillText(String(node.email).slice(0, node.type === 'service' ? 24 : 32), labelX, y + 35);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - viewport.x) / viewport.scale,
      y: (event.clientY - rect.top - viewport.y) / viewport.scale,
      rawX: event.clientX - rect.left,
      rawY: event.clientY - rect.top
    };
  }

  function hitNode(event) {
    const point = canvasPoint(event);
    return nodes.findLast((node) => {
      const width = boxWidth(node);
      const height = boxHeight(node);
      return point.x >= node.x - width / 2
        && point.x <= node.x + width / 2
        && point.y >= node.y - height / 2
        && point.y <= node.y + height / 2;
    });
  }

  function down(event) {
    const point = canvasPoint(event);
    pointerStart = { x: point.rawX, y: point.rawY, vx: viewport.x, vy: viewport.y };
    wasPanning = false;
    canvas.setPointerCapture?.(event.pointerId);
  }

  function move(event) {
    if (!pointerStart) {
      const node = hitNode(event);
      const nextHover = node?.id ?? null;
      if (nextHover !== hoverNodeId) {
        hoverNodeId = nextHover;
        canvas.style.cursor = node ? 'pointer' : 'grab';
        draw();
      }
      return;
    }
    const rect = canvas.getBoundingClientRect();
    wasPanning = wasPanning || Math.abs(event.clientX - rect.left - pointerStart.x) > 3 || Math.abs(event.clientY - rect.top - pointerStart.y) > 3;
    viewport = clampViewport({
      ...viewport,
      x: pointerStart.vx + (event.clientX - rect.left - pointerStart.x),
      y: pointerStart.vy + (event.clientY - rect.top - pointerStart.y)
    }, rect.width, rect.height);
    draw();
  }

  function up() {
    pointerStart = null;
  }

  function leave() {
    pointerStart = null;
    hoverNodeId = null;
    if (canvas) canvas.style.cursor = 'grab';
    draw();
  }

  function click(event) {
    if (wasPanning) {
      wasPanning = false;
      return;
    }
    const node = hitNode(event);
    if (!node) return;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      onSelect?.(node);
    }, 180);
  }

  function dblclick(event) {
    clearTimeout(clickTimer);
    const node = hitNode(event);
    if (node && confirm('Kas soovid selle allika avada?')) onOpenSource?.(node);
  }

  function wheel(event) {
    event.preventDefault();
    const point = canvasPoint(event);
    const nextScale = Math.min(2.2, Math.max(.55, viewport.scale + (event.deltaY > 0 ? -.08 : .08)));
    const rect = canvas.getBoundingClientRect();
    viewport = clampViewport({
      x: point.rawX - point.x * nextScale,
      y: point.rawY - point.y * nextScale,
      scale: nextScale
    }, rect.width, rect.height);
    draw();
  }
</script>

<section class="map box _outer grid gap _2">
  <header class="flex _space _wrap gap">
    <div>
      <span>Relationship map</span>
      <h2>{selectedType === 'company' ? 'Company network' : 'Customer network'}</h2>
      <p>Pan the canvas, zoom with the mouse wheel and double-click a service to open the source module.</p>
    </div>
    <small>{nodes.length ? `${nodes.length} visible nodes` : 'Select a customer or company'}</small>
  </header>
  <canvas
    bind:this={canvas}
    aria-label="Customer and company relationship map"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointerleave={leave}
    onclick={click}
    ondblclick={dblclick}
    onwheel={wheel}
  ></canvas>
  <div class="legend flex _wrap gap" aria-label="Relationship map color legend">
    <span><i class="company"></i> Company</span>
    <span><i class="customer"></i> Customer</span>
    <span><i class="service"></i> Service</span>
    <span><i class="activity"></i> Open activity</span>
  </div>
</section>

<style>
  .map {
    padding: 18px;
  }

  canvas {
    width: 100%;
    height: 460px;
    border: 1px solid var(--override-border, #d9dee7);
    border-radius: 8px;
    background: #fcfcfd;
    touch-action: none;
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .legend i {
    width: 14px;
    height: 14px;
    border: 1px solid;
    border-radius: 5px;
  }

  .legend .company {
    background: #eef2ff;
    border-color: #6172f3;
  }

  .legend .customer {
    background: #ecfdf3;
    border-color: #17b26a;
  }

  .legend .service {
    background: #fff7ed;
    border-color: #f79009;
  }

  .legend .activity {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #f79009;
    border-color: #f79009;
  }

  h2,
  p {
    margin: 0;
  }

  p {
    color: var(--override-text, #475467);
  }

  span,
  small {
    color: var(--override-muted, #667085);
    font-size: 12px;
  }
</style>
