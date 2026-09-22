// 开场「音乐鼓点 → 回忆照片」蒙太奇。
//
// 和 photos.js 的五颗特殊星星照片卡片是两套彼此独立的机制：
//   1. 唯一时钟是 audio.getMusicTime()（真实音轨的 currentTime）。
//      每帧用 requestAnimationFrame 比较「现在播放到哪了」，绝不用 setTimeout 模拟鼓点，
//      所以音频加载快慢、手机性能、rAF 掉帧、首次播放延迟都不会让画面跑偏 ——
//      音乐播放到哪，视觉就追到哪。
//   2. 只做视觉：不碰 photos 的 viewedStars / openedStars，
//      也不会让自动出现的照片顶替「五颗星全部看完」的判定。
//   3. 用户一旦点开某张照片卡片，蒙太奇立刻让位（见 shouldYield），
//      避免「自动播放的照片」和「用户点开的照片」抢屏。
//
// 这一层由本模块自己创建 / 销毁，index.html 里不需要任何标记，
// 所以不会影响现有页面的 DOM 结构。

import { birthdayConfig } from "./config.js";
import { loadImage, waitForImagePaint, wait } from "./utils.js";

export class MemoryMontage {
  /**
   * @param {{ shouldYield?: () => boolean }} [opts]
   *   shouldYield: 每帧询问「现在该不该让位」。main.js 传 () => photos.isOpen。
   */
  constructor(opts = {}) {
    this.cfg = birthdayConfig.memoryMontage || {};
    this.shouldYield = opts.shouldYield || (() => false);

    this.layer = null;
    this.img = null;
    this.raf = 0;
    this.running = false;

    // 与 photos.js 同一套「最后一次请求优先」纪律
    this.loadToken = 0;
    this.shown = null; // 已经真正提交到 <img> 上的 memories 下标
    this.preloaded = null;
    this.nextIndex = 0;
    this.yielded = false;

    this.nudgeHandler = null;
    this.doneResolve = null;
  }

  // ------------------------------ DOM ------------------------------

  build() {
    if (this.layer) return;
    const cfg = this.cfg;

    const layer = document.createElement("div");
    layer.className = "memory-montage";
    layer.setAttribute("aria-hidden", "true");
    // 时长与压暗强度全部由 config.js 驱动，CSS 里只写兜底默认值
    layer.style.setProperty("--montage-fade", `${cfg.fadeMs ?? 380}ms`);
    layer.style.setProperty("--montage-end-fade", `${cfg.endFadeMs ?? 620}ms`);
    layer.style.setProperty("--montage-scale-from", String(cfg.scaleFrom ?? 0.94));
    const scrim = cfg.scrim ?? 0.62;
    layer.style.setProperty("--montage-scrim", String(scrim));
    layer.style.setProperty("--montage-scrim-mid", String(scrim * 0.48));

    const panel = document.createElement("div");
    panel.className = "memory-montage-panel";

    const img = document.createElement("img");
    img.className = "memory-montage-img";
    img.alt = "";
    img.decoding = "async";

    panel.appendChild(img);
    layer.appendChild(panel);
    (document.getElementById("viewport") || document.body).appendChild(layer);

    this.layer = layer;
    this.img = img;
  }

  // ---------------------------- 图片加载 ----------------------------

  preload() {
    this.preloaded = new Map();
    for (const memory of birthdayConfig.memories) {
      const job = loadImage(memory.image).catch((err) => {
        console.error("[montage] 预加载失败：", memory.image, err);
        return null;
      });
      this.preloaded.set(memory.image, job);
    }
  }

  /** 取目标照片：优先用预加载好的（已经 load + decode），失败则重试一次。 */
  async getImage(src) {
    const job = this.preloaded && this.preloaded.get(src);
    if (job) {
      const image = await job;
      if (image) return image;
    }
    return loadImage(src);
  }

  // ---------------------------- 单张显示 ----------------------------

  /**
   * 显示 memories[index] 这一张。纪律和 photos.js 一样：
   *   旧照片先淡出（只动照片内容，面板位置/缩放不动）
   *   → 等目标照片真的可以绘制
   *   → 只有最新请求能提交，旧请求直接丢弃
   * 所以掉帧跨过两个鼓点时只有最后那一个会落屏，也不会闪回旧照片。
   */
  async show(index) {
    const memory = birthdayConfig.memories[index];
    if (!memory || !this.img || !this.layer) return;

    const token = ++this.loadToken;
    const isFirst = this.shown === null;
    const fadeMs = this.cfg.fadeMs ?? 380;

    let target;
    try {
      if (isFirst) {
        // 第一张：面板和照片一起淡入，不需要先淡出旧图
        target = await this.getImage(memory.image);
        if (token !== this.loadToken) return;
        if (this.yielded || !this.layer) return;
      } else {
        this.layer.classList.add("is-switching"); // 旧图开始淡出
        // 加载与「旧图淡出」并行；两者都完成后再换 src，
        // 旧照片不会被中途接住，新照片也不会在旧图还没退场时就冒出来。
        [target] = await Promise.all([this.getImage(memory.image), wait(fadeMs)]);
        if (token !== this.loadToken) return;
        if (this.yielded || !this.layer) return;
      }

      this.img.src = target.src;
      await waitForImagePaint(this.img); // 等新照片真的画得出来了再揭开
      if (token !== this.loadToken) return;
      if (this.yielded || !this.layer) return;
    } catch (err) {
      if (token !== this.loadToken) return;
      if (!this.layer) return;
      console.error("[montage] 照片加载失败，这一拍不放照片：", memory.image, err);
      // 这一拍整层收起：照片内容保持隐藏，绝不用上一张冒充这一张
      this.layer.classList.add("is-switching");
      this.layer.classList.remove("is-visible");
      this.shown = null;
      return;
    }

    this.shown = index;
    this.layer.classList.add("is-visible");
    this.layer.classList.remove("is-switching");
  }

  // ---------------------------- 主循环 ----------------------------

  /**
   * 跑完整段蒙太奇。不阻塞剧情：main.js 并行调用、不需要 await。
   * 结束（到达 endTime 或被 stop()）时会清掉全部临时状态并移除这一层。
   */
  play(audio) {
    const cfg = this.cfg;
    if (cfg.enabled === false) return Promise.resolve();

    const timeline = (birthdayConfig.memoryBeatTimeline || [])
      .filter((e) => e && typeof e.time === "number")
      .slice()
      .sort((a, b) => a.time - b.time);
    if (!timeline.length) return Promise.resolve();

    this.build();
    this.preload();
    this.bindNudge(audio);

    const last = timeline[timeline.length - 1];
    let endTime = typeof cfg.endTime === "number" ? cfg.endTime : last.time + (cfg.endHold ?? 3);
    if (endTime <= last.time) endTime = last.time + (cfg.endHold ?? 3); // 防止配错把最后一张吞掉

    return new Promise((resolve) => {
      this.doneResolve = resolve;
      this.running = true;

      this.pickClock(audio).then((clock) => {
        if (!clock) {
          if (this.running) {
            console.warn(
              "[montage] 没有真实音轨在播放（音乐文件不可用或还没起播），跳过音乐鼓点蒙太奇：" +
                "不会假装还和 Episode 33 同步"
            );
          }
          this.teardown();
          return;
        }
        if (!this.running) return; // 等待期间已经被 stop() 掉了
        this.loop(clock, timeline, endTime);
      });
    });
  }

  /**
   * 等真实音轨真正开始播放，返回一个时钟 { now(): seconds }。
   * 等不到时按 cfg.fallbackMode 处理：
   *   "skip"    → 返回 null（默认，直接不放）
   *   "elapsed" → 退化成「开始播放后经过的真实时间」，仅作视觉占位
   */
  pickClock(audio) {
    const cfg = this.cfg;
    const timeoutMs = (cfg.waitTimeout ?? 20) * 1000;
    const t0 = performance.now();

    return new Promise((resolve) => {
      const step = () => {
        if (!this.running) return resolve(null);
        if (audio.getMusicTime() != null) {
          return resolve({ now: () => audio.getMusicTime() });
        }
        // 已经决定用合成音乐了，不用再等
        if (audio.started && !audio.useFile) {
          if ((cfg.fallbackMode || "skip") === "elapsed") {
            console.warn(
              "[montage] 音乐文件不可用，已回退到合成音乐；按 fallbackMode='elapsed' 用真实经过时间放照片，" +
                "这只是视觉占位，不代表和 Episode 33 的鼓点同步"
            );
            const start = performance.now();
            return resolve({ now: () => (performance.now() - start) / 1000 });
          }
          return resolve(null);
        }
        if (performance.now() - t0 > timeoutMs) return resolve(null);
        requestAnimationFrame(step);
      };
      step();
    });
  }

  loop(clock, timeline, endTime) {
    const step = () => {
      if (!this.running) return; // 已被 stop()

      // 用户点开了照片卡片：蒙太奇立刻收起并放弃这一拍，绝不和用户抢屏
      const yielded = !!this.shouldYield();
      if (yielded !== this.yielded) {
        this.yielded = yielded;
        if (yielded) {
          this.loadToken += 1; // 作废在途请求
          this.layer.classList.remove("is-visible");
          this.shown = null;
        }
      }

      const now = clock.now();
      if (now == null) {
        // 音乐被暂停 / 中断：保持等待，恢复播放后会自动追上
        this.raf = requestAnimationFrame(step);
        return;
      }

      // 关键：while + nextIndex，并且用 >= 而不是 ===。
      // 一次掉帧跨过两个鼓点时索引会一次补齐，不会永久漏掉某个时间点；
      // 视觉上只有最后那一个会真正落屏（后发的请求会顶掉先发的 token）。
      while (this.nextIndex < timeline.length && now >= timeline[this.nextIndex].time) {
        const entry = timeline[this.nextIndex];
        this.nextIndex += 1;
        if (!this.yielded) {
          this.show(entry.memory).catch((err) => console.error("[montage] 显示失败：", err));
        }
      }

      if (now >= endTime) {
        this.finish();
        return;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** 到达 endTime 的优雅收尾：淡出 → 清除临时状态 → 恢复正常星空 */
  async finish() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.loadToken += 1; // 作废在途请求
    if (!this.layer) {
      this.teardown();
      return;
    }
    this.layer.classList.remove("is-visible"); // CSS 负责淡出
    await wait(this.cfg.endFadeMs ?? 620);
    this.teardown();
  }

  /** 剧情推进（五张照片都看完了）时立刻收起，不做淡出，避免压到后面的镜头 */
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.loadToken += 1;
    this.teardown();
  }

  /** 清掉临时状态、把这一层从 DOM 移除，让星空完全恢复原样 */
  teardown() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.loadToken += 1;

    if (this.nudgeHandler) {
      window.removeEventListener("pointerdown", this.nudgeHandler);
      window.removeEventListener("touchstart", this.nudgeHandler);
      this.nudgeHandler = null;
    }
    if (this.layer) {
      if (this.img) this.img.removeAttribute("src");
      if (this.layer.parentNode) this.layer.parentNode.removeChild(this.layer);
    }
    this.layer = null;
    this.img = null;
    this.shown = null;
    this.preloaded = null;

    if (this.doneResolve) {
      const done = this.doneResolve;
      this.doneResolve = null;
      done();
    }
  }

  /** 音轨已加载但被浏览器拦下自动播放时，任意一次触摸 / 点击里再试一次 play() */
  bindNudge(audio) {
    if (this.nudgeHandler) return;
    this.nudgeHandler = () => audio.resumeTrack();
    window.addEventListener("pointerdown", this.nudgeHandler);
    window.addEventListener("touchstart", this.nudgeHandler, { passive: true });
  }
}
