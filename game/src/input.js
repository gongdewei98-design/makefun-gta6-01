// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (enter a car, pause, confirm) are queued and taken once by the loop, so a
// press between two frames is never lost and never counted twice.

export const PRESS_ENTER_CAR = 1;
export const PRESS_PAUSE = 2;
export const PRESS_CONFIRM = 4;
export const PRESS_MUTE = 8;
export const PRESS_HORN = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);

export function createInput(canvas) {
  const held = new Set();
  let pressed = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mousePressed = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'KeyE') pressed |= PRESS_ENTER_CAR;
    else if (event.code === 'Escape' || event.code === 'KeyP') pressed |= PRESS_PAUSE;
    else if (event.code === 'Enter' || event.code === 'Space') pressed |= PRESS_CONFIRM;
    else if (event.code === 'KeyM') pressed |= PRESS_MUTE;
    else if (event.code === 'KeyH') pressed |= PRESS_HORN;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    if (event.button === 0) {
      mouseDown = true;
      mousePressed = true;
    }
  }

  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }

  function onBlur() {
    held.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    // Steering axes, each -1, 0 or 1.
    axisX() {
      let x = 0;
      for (const code of held) {
        if (LEFT.has(code)) x -= 1;
        if (RIGHT.has(code)) x += 1;
      }
      return Math.max(-1, Math.min(1, x));
    },
    axisY() {
      let y = 0;
      for (const code of held) {
        if (UP.has(code)) y -= 1;
        if (DOWN.has(code)) y += 1;
      }
      return Math.max(-1, Math.min(1, y));
    },
    isDown(code) {
      return held.has(code);
    },
    get sprint() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    get handbrake() {
      return held.has('Space');
    },
    get mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    /** One-shot presses since the last call, as PRESS_* flags. */
    takePresses() {
      const taken = pressed;
      pressed = 0;
      return taken;
    },
    /** True once per click, for firing a single shot. */
    takeMousePress() {
      const taken = mousePressed;
      mousePressed = false;
      return taken;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
}
