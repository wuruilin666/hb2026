import { birthdayConfig } from "./config.js";
import { loadImage, waitForImagePaint } from "./utils.js";

const TOTAL_MEMORIES = birthdayConfig.memories.length;

export const photos = {
  card: null,
  img: null,
  closeBtn: null,
  isOpen: false,
  /** 最近一次用户点开的星星（意图）。它 != 「已经看到过」，不要拿它去记 viewedStars */
  activeStar: null,
  /** 真正成功加载并提交到 <img> 上、此刻正在显示的那颗星；null = 屏幕上没有照片 */
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

  /**
   * 「这一张看完了」—— 把当前真正显示着的那张记为已查看。
   *
   * viewedStars 只有这一个写入点（main.js 里 ?skip=1 的调试分支除外），
   * 而 currentStar 只在「图片真的加载成功、并且已经画到屏幕上」之后才会被赋值，所以：
   *   - 加载失败的目标照片永远不会被记成已查看；
   *   - 被后面某次点击抢占、结果被丢弃的请求，同样永远不会被记成已查看。
   */
  retireCurrent() {
    if (this.currentStar != null) {
      this.viewedStars.add(this.currentStar);
      this.currentStar = null;
    }
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
      if (token !== this.loadToken) return; // 已被更新的点击抢占：整体丢弃，不碰任何状态

      this.img.src = target.src;
      await waitForImagePaint(this.img); // 等新照片真的画得出来了再揭开
      if (token !== this.loadToken) return; // 等待期间又被点击 / 被关闭：同样丢弃
    } catch (err) {
      if (token !== this.loadToken) return;
      console.error("[photos] 照片加载失败：", memory.image, err);
      // 加载失败：刚才那张已经从屏幕上消失了，按「看完」处理；
      // 但失败的目标照片绝不能算已查看，也绝不用上一张冒充它。
      this.retireCurrent();
      this.card.classList.add("switching");
      this.revealCard();
      return;
    }

    // 只有最后一次点击才能走到这里，提交显示状态
    this.retireCurrent(); // 上一张真正显示过的照片，直到此刻才算「看完」
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
    this.retireCurrent(); // 关闭 = 这一张看完了
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
