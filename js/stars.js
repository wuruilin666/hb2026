import { birthdayConfig } from "./config.js";
import { wait, random, randomInt } from "./utils.js";
import { photos } from "./photos.js";

const TOTAL_STARS = 20;
const SPECIAL_SET = new Set(birthdayConfig.memories.map((m) => m.star));

export class Stars {
  constructor(container) {
    this.container = container;
    this.stars = [];
    this.built = false;
    this.musicRaf = 0;
  }

  build() {
    if (this.built) return;
    this.container.innerHTML = "";
    this.stars = [];

    for (let i = 1; i <= TOTAL_STARS; i++) {
      const isSpecial = SPECIAL_SET.has(i);
      const el = document.createElement("div");
      el.className = `star ${isSpecial ? "special" : ""}`;
      el.style.left = `${random(8, 92)}%`;
      el.style.top = `${random(6, 70)}%`;

      const size = isSpecial ? random(5, 7) : random(2, 4);
      const core = document.createElement("span");
      core.className = "star-core";
      core.style.width = `${size}px`;
      core.style.height = `${size}px`;
      el.appendChild(core);

      if (!isSpecial) {
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.transitionDelay = `${random(0, 0.4)}s`;
      } else {
        el.style.width = "26px";
        el.style.height = "26px";
        el.style.marginLeft = "-13px";
        el.style.marginTop = "-13px";
      }

      if (isSpecial) {
        el.addEventListener("click", () => {
          el.classList.add("active");
          setTimeout(() => el.classList.remove("active"), 200);
          photos.openForStar(i);
        });
      }

      this.container.appendChild(el);
      this.stars.push({ index: i, element: el, isSpecial });
    }
    this.built = true;
  }

  /**
   * 让星星出现。
   *
   * 两条轨道并行跑：
   *   · 15 颗普通星星：完全沿用原来的节奏（原来的公式、原来的顺序），
   *     仍然是一颗一颗自然出现，整体观感不变。
   *   · 5 颗特殊星星：只由 assets/bgm.mp3 的真实播放位置驱动（见 appearSpecials）。
   *
   * 音乐只决定「特殊星星什么时候亮起来」。这里不会、也不允许自动打开任何照片 ——
   * 照片永远只能是用户点击特殊星星后由 photos.openForStar() 打开。
   *
   * @param {import("./audio.js").AudioManager} [audio]
   */
  async appear(audio) {
    this.build();
    const base = birthdayConfig.timing.starAppearBase;
    const ramp = birthdayConfig.timing.starAppearRamp;

    await Promise.all([
      this.appearNormals(base, ramp),
      this.appearSpecials(audio, base, ramp)
    ]);

    await wait(birthdayConfig.timing.starPauseAfterAll);

    for (const star of this.stars) {
      star.element.classList.add("twinkle");
    }
  }

  /** 普通星星：沿用原来的 wait(base - index * ramp + jitter)，一颗一颗出现 */
  async appearNormals(base, ramp) {
    for (const star of this.stars) {
      if (star.isSpecial) continue;
      await wait(base - star.index * ramp + randomInt(-30, 30));
      star.element.classList.add("visible");
    }
  }

  /**
   * 五颗特殊星星：按 bgm 里实测出来的鼓点依次亮起来。
   *
   * - 唯一时钟是 audio.getMusicTime()（= <audio>.currentTime），
   *   每帧用 requestAnimationFrame 比较「现在播到哪了」；
   * - 条件是 now >= time（不是 ===），并且用 while + nextIndex 一次补齐，
   *   所以起播晚了（例如音乐真正开始时已经 1.1s）或者一次掉帧跨过几个鼓点，
   *   对应的星星都会照常出现，绝不会漏；
   * - 全程没有用 setTimeout 去模拟鼓点，也没有用 performance.now() 自己数时间
   *   （那里只用于「一直等不到音轨」的超时保护）。
   *
   * 音乐文件不可用、已经回退到内置合成音乐时：明确退回原来的普通出现节奏，
   * 绝不把合成音乐的时间轴当成 Episode 33 的鼓点。
   */
  async appearSpecials(audio, base, ramp) {
    const specials = this.stars.filter((s) => s.isSpecial);
    if (!specials.length) return;

    const byStar = new Map(specials.map((s) => [s.index, s]));
    const entries = (birthdayConfig.specialStarBeatTimeline || [])
      .filter((e) => e && typeof e.time === "number" && byStar.has(e.star))
      .slice()
      .sort((a, b) => a.time - b.time);

    const hasClock = entries.length > 0 && (await this.waitForMusic(audio));
    if (!hasClock) {
      if (entries.length > 0) {
        console.warn(
          "[stars] 拿不到真实音乐时间（音乐文件不可用，或已回退到内置合成音乐），" +
            "五颗特殊星星退回原来的出现节奏"
        );
      }
      for (const star of specials) {
        await wait(base - star.index * ramp + randomInt(-30, 30));
        star.element.classList.add("visible");
      }
      return;
    }

    const shown = new Set();
    let nextIndex = 0;

    await new Promise((resolve) => {
      const step = () => {
        const now = audio.getMusicTime();

        if (now == null) {
          // 音乐还没起播 / 被暂停 / 被中断：保持等待，恢复播放后会自动追上去
          this.musicRaf = requestAnimationFrame(step);
          return;
        }

        // while + nextIndex + >= ：
        // 一次掉帧跨过两个鼓点时索引一次补齐，不会永久漏掉某个时间点。
        while (nextIndex < entries.length && now >= entries[nextIndex].time) {
          const star = byStar.get(entries[nextIndex].star);
          nextIndex += 1;
          if (star && !shown.has(star.index)) {
            shown.add(star.index);
            star.element.classList.add("visible");
          }
        }

        if (nextIndex >= entries.length) {
          resolve();
          return;
        }
        this.musicRaf = requestAnimationFrame(step);
      };
      this.musicRaf = requestAnimationFrame(step);
    });
  }

  /**
   * 等真实音轨真正开始播放。
   * true  = 已经有权威的音乐时间可用
   * false = 音轨不可用 / 已回退到合成音乐 / 等超时了
   */
  waitForMusic(audio) {
    if (!audio || typeof audio.getMusicTime !== "function") return Promise.resolve(false);

    const timeoutMs = birthdayConfig.timing.specialStarWaitTimeout ?? 12000;
    const t0 = performance.now(); // 只用于超时保护，不作为音乐时间
    let frames = 0;

    return new Promise((resolve) => {
      const step = () => {
        if (audio.isTrackPlaying()) return resolve(true);
        // 已经确定走内置合成音乐了 → 不假装能对鼓点
        if (audio.started && !audio.useFile) return resolve(false);
        // 音轨已加载但被浏览器拦下自动播放：每 ~0.5s 顺手再试一次 play()
        if (typeof audio.resumeTrack === "function" && ++frames % 30 === 0) audio.resumeTrack();
        if (performance.now() - t0 > timeoutMs) return resolve(false);
        requestAnimationFrame(step);
      };
      step();
    });
  }

  dim() {
    this.stars.forEach((s) => {
      s.element.style.transition = "opacity 1.5s ease";
      s.element.style.opacity = "0.25";
    });
  }
}
