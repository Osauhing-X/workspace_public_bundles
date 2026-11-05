// Use pointer distance, not scrollLeft: a full-width 24-hour track has no
// physical overflow, so browsers clamp scrollLeft to zero on wide displays.
export function advanceDayDrag(drag, clientX, hourWidth) {
  if (!Number.isFinite(clientX) || !Number.isFinite(hourWidth) || hourWidth <= 0) throw new Error('Invalid timeline movement.');
  const distance = (drag.remainder ?? 0) + drag.x - clientX;
  const steps = Math.trunc(distance / hourWidth) || 0;
  return { ...drag, x: clientX, remainder: distance - steps * hourWidth, steps };
}
