// Window-aware timers with a test-host fallback. Capturing `window` once keeps
// popout windows on their own timer queue; Bun tests fall back to the global timers.
// 使用宿主窗口计时器（多窗口安全），测试环境回退到全局计时器。
export type TimerId = ReturnType<typeof setTimeout>;

const fallbackSetTimeout = setTimeout;
const fallbackClearTimeout = clearTimeout;
const host = typeof window !== 'undefined' ? window : null;

export function setTimer(callback:()=>void, delay:number):TimerId {
  return host ? host.setTimeout(callback, delay) as unknown as TimerId : fallbackSetTimeout(callback, delay);
}

export function clearTimer(id:TimerId | null | undefined):void {
  if (id == null) return;
  if (host) host.clearTimeout(id as unknown as number);
  else fallbackClearTimeout(id);
}
