// Svelte action to make an element draggable (by its header or whole element)
// Usage: <div use:draggable /> or <div use:draggable={{handle: '.header'}} />
export function draggable(node: HTMLElement, params: { handle?: string } = {}) {
  let pos = { x: 0, y: 0 };
  let dragging = false;
  let offset = { x: 0, y: 0 };
  let handleEl: HTMLElement | null = null;

  // Find the handle element if specified
  function getHandle() {
    if (params.handle) {
      handleEl = node.querySelector(params.handle) as HTMLElement;
    } else {
      handleEl = node;
    }
  }
  getHandle();

  function setPosition(x: number, y: number) {
    node.style.left = x + 'px';
    node.style.top = y + 'px';
  }

  function onMouseDown(e: MouseEvent) {
    dragging = true;
    // Only left mouse button
    if (e.button !== 0) return;
    offset.x = e.clientX - node.offsetLeft;
    offset.y = e.clientY - node.offsetTop;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging) return;
    pos.x = e.clientX - offset.x;
    pos.y = e.clientY - offset.y;
    setPosition(pos.x, pos.y);
  }

  function onMouseUp() {
    dragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  node.style.position = 'fixed';
  // Default position: top right corner
  if (!node.style.left && !node.style.right) {
    node.style.right = '10px';
  }
  if (!node.style.top) {
    node.style.top = '10px';
  }

  if (handleEl) {
    (handleEl as HTMLElement).style.cursor = 'move';
    (handleEl as HTMLElement).addEventListener('mousedown', onMouseDown);
  }

  return {
    update(newParams: { handle?: string }) {
      params = newParams;
      if (handleEl) handleEl.removeEventListener('mousedown', onMouseDown);
      getHandle();
      if (handleEl) handleEl.addEventListener('mousedown', onMouseDown);
    },
    destroy() {
      if (handleEl) handleEl.removeEventListener('mousedown', onMouseDown);
    },
  };
}
