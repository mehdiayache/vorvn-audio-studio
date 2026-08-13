export function moveSelectionToPosition(order: number[], selectedIds: number[], requestedPosition: number) {
  const selected = new Set(selectedIds)
  const moving = order.filter((id) => selected.has(id))
  if (!moving.length) return order
  const remaining = order.filter((id) => !selected.has(id))
  const insertion = Math.max(0, Math.min(remaining.length, Math.round(requestedPosition) - 1))
  return [...remaining.slice(0, insertion), ...moving, ...remaining.slice(insertion)]
}
