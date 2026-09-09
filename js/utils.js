export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export const random = (min, max) => Math.random() * (max - min) + min;

export const randomInt = (min, max) => Math.floor(random(min, max + 1));

export function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function once(el, event) {
  return new Promise((resolve) => {
    const handler = (e) => {
      el.removeEventListener(event, handler);
      resolve(e);
    };
    el.addEventListener(event, handler, { once: true });
  });
}
