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

/**
 * 加载并解码一张图片，返回 Promise<HTMLImageElement>。
 *
 * - 真正等待 load，并且尽可能等待 decode()：resolve 之后这张图就可以立刻被绘制，
 *   不会出现「先继续显示旧图、等新图好了才换」的中间态。
 * - decode() 失败不代表图片不可用（例如被中断），按成功处理。
 * - onload 与「命中缓存直接完成」两条路径都可能触发完成，用 settled 保证只 settle 一次。
 *
 * 供 photos.js（五颗特殊星星的照片卡片）使用：点击星星换图时靠这两个 helper
 * 保证「旧图先退场、新图真的可以绘制了才揭开」，不会闪回旧图。
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const loaded = () => {
      if (typeof image.decode === "function") {
        image.decode().then(
          () => settle(resolve, image),
          () => settle(resolve, image)
        );
      } else {
        settle(resolve, image);
      }
    };

    image.onload = loaded;
    image.onerror = () => settle(reject, new Error(`image failed to load: ${src}`));
    image.src = src;

    // 命中缓存的图片不必等事件
    if (image.complete && image.naturalWidth > 0) {
      image.onload = null;
      image.onerror = null;
      loaded();
    }
  });
}

/**
 * 等一个已经存在于 DOM 里的 <img> 把「当前 src」准备好可以绘制。
 * 用在 `img.src = target.src` 之后，确认新照片真的画得出来了，再揭开照片区域。
 */
export function waitForImagePaint(img) {
  const decodeNow = () =>
    typeof img.decode === "function" ? img.decode().catch(() => {}) : Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
      fn(value);
    };

    function onLoad() {
      decodeNow().then(() => finish(resolve, img));
    }
    function onError() {
      finish(reject, new Error("photo element failed to load"));
    }

    // 先挂监听、再查 complete：避免「事件已经派发完，监听器还没挂上」而永远等不到
    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);

    if (img.complete && img.naturalWidth > 0) {
      onLoad();
    }
  });
}
