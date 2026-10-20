// Cancel scrolling gestures and synthetic clicks; no EmbedUI runtime dependency.
export interface TouchPoint { clientX: number; clientY: number; identifier: number }
export interface TouchStartEvent { touches: ArrayLike<TouchPoint> }
export interface TouchEndEvent { changedTouches: ArrayLike<TouchPoint>; preventDefault(): void; stopPropagation(): void }
export function makeTouchHandler(action:(event:TouchEndEvent)=>void, threshold = 10) {
  let start: { x: number; y: number; id: number } | null = null;
  return {
    onTouchStart(this:void, event:TouchStartEvent) {
      const touch = event.touches?.length === 1 ? event.touches[0] : null;
      start = touch ? { x: touch.clientX, y: touch.clientY, id: touch.identifier } : null;
    },
    onTouchEnd(this:void, event:TouchEndEvent) {
      event.preventDefault();
      const touch = Array.from(event.changedTouches || []).find(item => item.identifier === start?.id);
      const tap = touch && start && Math.abs(touch.clientX - start.x) <= threshold && Math.abs(touch.clientY - start.y) <= threshold;
      start = null;
      if (tap) action(event);
    }
  };
}
