import { birthdayConfig } from "./config.js";

const TOTAL_MEMORIES = birthdayConfig.memories.length;

/**
 * 加载并解码一张图片，返回 Promise<HTMLImageElement>。
 *
 * - 真正等待 load，并且尽可能等待 decode()：resolve 之后这张图就可以立刻被绘制，
 *   不会出现「先继续显示旧图、等新图好了才换」的中间态。
 * - decode() 失败不代表图片不可用（例如被中断），按成功处理。
 * - onload 与「命中缓存直接完成」两条路径都可能触发完成，用 settled 保证只 settle 一次。
 */
function loadImage(src) {
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
function waitForPaintableImage(img) {
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

export const photos = {
  card: null,
  img: null,
  closeBtn: null,
  isOpen: false,
  activeStar: null,
  /** 当前真正提交到 <img> 上、正在显示的那颗星 */
  currentStar: null,
  viewedStars: new Set(),
  openedStars: new Set(),

  /**
   * 「最后一次点击优先」的请求版本号。
   * openForStar() 每次 +1；close() / reset() 也会 +1，让在途请求全部作废。
   * 只有拿到最新 token 的异步加载才有权提交最终的显示状态。
   */
  loadToken: 0,

  /** star -> Promise<HTMLImageElement|null>，init() 时一次性预加载全部照片 */
  preloaded: null,

  init() {
    this.card = document.getElementById("photo-card");
    this.img = document.getElementById("photo-img");
    this.closeBtn = this.card.querySelector(".photo-close");

    this.closeBtn.addEventListener("click", () => this.close());
    this.card.addEventListener("click", (e) => {
      if (e.target === this.card) this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });

    this.preload();
  },

  /**
   * 预加载五张照片。用户还没点星星时图片就已经在下载 + 解码，
   * 所以真正点击时基本是「无缝切换」。
   */
  preload() {
    this.preloaded = new Map();
    for (const memory of birthdayConfig.memories) {
      const job = loadImage(memory.image).catch((err) => {
        console.error("[photos] 预加载失败：", memory.image, err);
        return null;
      });
      this.preloaded.set(memory.star, job);
    }
  },

  /** 取目标照片：优先用预加载好的（已经 load + decode）；预加载失败会重试一次。 */
  async getTargetImage(starIndex, src) {
    const job = this.preloaded && this.preloaded.get(starIndex);
    if (job) {
      const image = await job;
      if (image) return image;
    }
    return loadImage(src);
  },

  async openForStar(starIndex) {
    const memory = birthdayConfig.memories.find((m) => m.star === starIndex);
    if (!memory || !this.img || !this.card) return;

    // 正在显示的就是这一张、而且没有未完成的切换：不做无用功
    if (
      this.isOpen &&
      this.currentStar === starIndex &&
      !this.card.classList.contains("switching")
    ) {
      this.activeStar = starIndex;
      this.openedStars.add(starIndex);
      return;
    }

    // 这一次点击成为唯一合法的请求
    const token = ++this.loadToken;

    // 打开新照片即视为「上一张已经看完」
    if (this.activeStar != null && this.activeStar !== starIndex) {
      this.viewedStars.add(this.activeStar);
    }
    this.activeStar = starIndex;
    this.openedStars.add(starIndex);

    if (this.isOpen) {
      // 已经在看照片时直接切图：先把旧照片藏起来，绝不让它在目标照片就绪前继续顶位。
      // 只隐藏照片内容（淡出），卡片外壳保持原位、原缩放，不重播整个进入动画。
      this.card.classList.add("switching");
    }

    let target;
    try {
      target = await this.getTargetImage(starIndex, memory.image);
      if (token !== this.loadToken) return; // 已经有更新的点击：丢弃这次结果

      this.img.src = target.src;
      await waitForPaintableImage(this.img); // 等新照片真的画得出来了再揭开
      if (token !== this.loadToken) return; // 等待期间又被点击 / 被关闭：丢弃
    } catch (err) {
      if (token !== this.loadToken) return;
      // 加载失败：保持照片区域隐藏，绝不用上一张照片冒充这一张。
      console.error("[photos] 照片加载失败：", memory.image, err);
      this.card.classList.add("switching");
      this.revealCard();
      return;
    }

    // 只有最后一次点击才能走到这里，提交显示状态
    this.currentStar = starIndex;
    this.revealCard();
    this.card.classList.remove("switching");
  },

  /** 打开照片卡片外壳。切换照片时它本来就是打开的，因此不会重播入场动画。 */
  revealCard() {
    this.card.classList.add("open");
    this.card.setAttribute("aria-hidden", "false");
    this.isOpen = true;
  },

  close() {
    if (!this.card) return;
    this.loadToken += 1; // 在途的加载请求全部作废，不允许它们再把照片打开
    // Closing counts as "viewed"
    if (this.activeStar != null) {
      this.viewedStars.add(this.activeStar);
    }
    this.card.classList.remove("open");
    this.card.classList.remove("switching");
    this.card.setAttribute("aria-hidden", "true");
    this.isOpen = false;
    this.activeStar = null;
  },

  areAllViewed() {
    return this.viewedStars.size >= TOTAL_MEMORIES;
  },

  reset() {
    this.loadToken += 1; // 在途请求全部作废
    this.viewedStars.clear();
    this.openedStars.clear();
    this.activeStar = null;
    this.currentStar = null;
    this.isOpen = false;
    if (this.card) {
      this.card.classList.remove("open");
      this.card.classList.remove("switching");
      this.card.setAttribute("aria-hidden", "true");
    }
    // preloaded 缓存保留：五张图已经解码过，重玩时零等待
  }
};
