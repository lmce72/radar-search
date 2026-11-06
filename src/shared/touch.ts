// Cancel scrolling gestures and synthetic clicks; no EmbedUI runtime dependency.
export interface TouchPoint { clientX: number; clientY: number; identifier: number }
export interface TouchStartEvent { touches: ArrayLike<TouchPoint>; currentTarget?: EventTarget | null }
export interface TouchEndEvent { changedTouches: ArrayLike<TouchPoint>; preventDefault(): void; stopPropagation(): void }
export function makeTouchHandler(action:(event:TouchEndEvent)=>void, threshold = 10) {
  let start: { x: number; y: number; id: number } | null = null;
  let target: EventTarget | null = null;
  // Remember any scrolling, even if the finger returns to its initial position.
  // 记住滚动过程，即使手指回到起点也不触发点击。
  const move = (event: Event) => {
    const touch = Array.from((event as TouchEvent).touches).find(touch => touch.identifier === start?.id);
    if (!touch || !start || Math.abs(touch.clientX-start.x)>threshold || Math.abs(touch.clientY-start.y)>threshold) start = null;
  };
  const cancel = () => { start = null; detach(); };
  const detach = () => {
    target?.removeEventListener('touchmove', move);
    target?.removeEventListener('touchcancel', cancel);
    target = null;
  };
  return {
    onTouchStart(this:void, event:TouchStartEvent) {
      detach();
      const touch = event.touches?.length === 1 ? event.touches[0] : null;
      start = touch ? { x: touch.clientX, y: touch.clientY, id: touch.identifier } : null;
      target = event.currentTarget || null;
      target?.addEventListener('touchmove', move, {passive: true});
      target?.addEventListener('touchcancel', cancel);
    },
    onTouchEnd(this:void, event:TouchEndEvent) {
      event.preventDefault();
      const touch = Array.from(event.changedTouches || []).find(item => item.identifier === start?.id);
      const tap = touch && start && Math.abs(touch.clientX - start.x) <= threshold && Math.abs(touch.clientY - start.y) <= threshold;
      start = null;
      detach();
      if (tap) action(event);
    }
  };
}
