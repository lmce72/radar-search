import {test, expect} from 'bun:test';
import {makeTouchHandler} from '../src/shared/touch.ts';

test('scrolling away and returning to the start never activates a touch result', () => {
  const target = new EventTarget();
  let activated = 0;
  const handler = makeTouchHandler(() => activated++);
  const point = (y: number) => ({identifier: 1, clientX: 20, clientY: y});
  const end = () => handler.onTouchEnd({changedTouches: [point(20)], preventDefault() {}, stopPropagation() {}});
  handler.onTouchStart({touches: [point(20)], currentTarget: target});
  target.dispatchEvent(Object.assign(new Event('touchmove'), {touches: [point(80)]}));
  target.dispatchEvent(Object.assign(new Event('touchmove'), {touches: [point(20)]}));
  end();
  expect(activated).toBe(0);
  handler.onTouchStart({touches: [point(20)], currentTarget: target});
  target.dispatchEvent(new Event('touchcancel'));
  end();
  expect(activated).toBe(0);
  handler.onTouchStart({touches: [point(20)], currentTarget: target});
  end();
  expect(activated).toBe(1);
});
