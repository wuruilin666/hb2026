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
        // 首次出现的闪耀动画播完就把 class 摘掉：
        // 保证每颗特殊星只播一次，不会被重绘 / twinkle / 点击重复触发。
        // 动画时长由 CSS 决定（420ms），这里只做清理，不参与任何时间同步。
        el.addEventListener("animationend", (e) => {
          if (e.animationName === "specialBurst") el.classList.remove("special-burst");
        });
      }

      this.container.appendChild(el);
      this.stars.push({ index: i, element: el, isSpecial });
    }
    this.built = true;
  }

  /**
   * 让星星出现。三种情况各自走明确的一条路，绝不「猜」：
   *
   * 1) 有真实音轨在播（startResult.mode === "file" 且 getMusicTime() 可用）
   *      · 15 颗普通星星：完全沿用原来的节奏（原公式、原顺序）
   *      · 5 颗特殊星星：只由 <audio>.currentTime 驱动，按配置的时间轴对齐
   *      两条轨道并行，与改动前完全一致。
   *
   * 2) 没有真实音轨（还没启动 / 已回退合成音乐 / 启动失败）
   *      · 明确进入「无音乐降级」：20 颗星星走**同一条**一颗一颗出现的序列。
   *        见 appearSequential 里为什么必须合成一条序列。
   *
   * 音乐只决定「特殊星星什么时候亮起来」。这里不会、也不允许自动打开任何照片 ——
   * 照片永远只能是用户点击特殊星星后由 photos.openForStar() 打开。
   *
   * @param {import("./audio.js").AudioManager} [audio]
   * @param {{ok:boolean,mode:string,reason?:string}|Promise<any>} [startResult]
   *        audio.start() 的结果（或它的 Promise）。给了它就**不再靠猜**：
   *        只有 mode === "file" 才认为有音乐时钟。没给则退回老的轮询（有界超时）。
   */
  async appear(audio, startResult) {
    this.build();
    const base = birthdayConfig.timing.starAppearBase;
    const ramp = birthdayConfig.timing.starAppearRamp;

    const plan = this.specialPlan();
    const hasClock = plan.entries.length > 0 && (await this.waitForMusic(audio, startResult));

    if (hasClock) {
      await Promise.all([
        this.appearNormals(base, ramp),
        this.appearSpecialsByMusic(audio, plan, base, ramp)
      ]);
    } else {
      if (plan.entries.length > 0) {
        console.warn(
          "[stars] 拿不到真实音乐时间（音乐文件未启动 / 不可用 / 已回退到合成音乐），" +
            "进入「无音乐降级」：20 颗星星走同一条一颗一颗出现的序列"
        );
      }
      await this.appearSequential(base, ramp);
    }

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
   * 无音乐降级：20 颗星星共用**同一条**「一颗一颗出现」的序列 ——
   * 普通星星按原来的公式出现，特殊星星在这条序列里轮到自己的序号时出现
   * （出现时仍带一次 special-burst）。
   *
   * 为什么必须合成一条序列：改动前普通星星与特殊星星各跑一条循环、各自算
   * `base - index * ramp`，于是 5 颗特殊星星被挤在 0.5~1.8s 里连续冒出来，
   * 看起来就像「星星几乎全都在同一瞬间刷出来」。
   * 合成一条序列之后，任意两颗之间都隔着一个自然的间隔，永远不会成堆出现。
   */
  async appearSequential(base, ramp) {
    for (const star of this.stars) {
      await wait(Math.max(0, base - star.index * ramp) + randomInt(-30, 30));
      if (star.isSpecial) this.revealSpecial(star);
      else star.element.classList.add("visible");
    }
  }

  /**
   * 特殊星「第一次亮起」：出现的同时附带一次短促闪耀（.special-burst，约 420ms）。
   *
   * 这里只负责加 class —— 什么时候亮、亮哪一颗，完全由调用方决定：
   * 有真实音乐时间时由 <audio>.currentTime 决定，降级时才是原来的节奏。
   * 动画结束后 animationend 会把 class 摘掉，所以每颗星只会播一次。
   */
  revealSpecial(star) {
    star.element.classList.add("visible");
    star.element.classList.add("special-burst");
  }

  /** 五颗特殊星星 + 它们按时间排好的时间轴条目 */
  specialPlan() {
    const specials = this.stars.filter((s) => s.isSpecial);
    const byStar = new Map(specials.map((s) => [s.index, s]));
    const entries = (birthdayConfig.specialStarBeatTimeline || [])
      .filter((e) => e && typeof e.time === "number" && byStar.has(e.star))
      .slice()
      .sort((a, b) => a.time - b.time);
    return { specials, byStar, entries };
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
   * 音轨在故事中途真的没了（暂停不回来 / 出错）：等满 musicStallTimeout 之后
   * 把剩下的星星按原节奏一颗一颗补齐，不让整个故事卡在星星这一步。
   */
  async appearSpecialsByMusic(audio, plan, base, ramp) {
    const { byStar, entries } = plan;
    if (!entries.length) return;

    const shown = new Set();
    let nextIndex = 0;
    let stalled = false;

    await new Promise((resolve) => {
      const stallLimit = birthdayConfig.timing.musicStallTimeout ?? 6000;
      let stalledSince = 0;

      const step = () => {
        const now = audio.getMusicTime();

        if (now == null) {
          // 音乐还没起播 / 被暂停 / 被中断：保持等待，恢复播放后会自动追上去。
          // 但绝不能无限等：音轨真的没了的话，整个故事会永远停在这一步。
          if (!stalledSince) {
            stalledSince = performance.now();
          } else if (performance.now() - stalledSince > stallLimit) {
            stalled = true;
            console.warn("[stars] 音轨中途再也拿不到音乐时间，剩余特殊星星按原节奏补齐");
            resolve();
            return;
          }
          this.musicRaf = requestAnimationFrame(step);
          return;
        }

        stalledSince = 0;

        // while + nextIndex + >= ：
        // 一次掉帧跨过两个鼓点时索引一次补齐，不会永久漏掉某个时间点。
        while (nextIndex < entries.length && now >= entries[nextIndex].time) {
          const star = byStar.get(entries[nextIndex].star);
          nextIndex += 1;
          if (star && !shown.has(star.index)) {
            shown.add(star.index);
            this.revealSpecial(star);
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

    if (!stalled) return;

    // 剩下的按原节奏一颗一颗补出来（互相之间仍有自然的间隔，不会同时冒出好几颗）
    for (let i = nextIndex; i < entries.length; i++) {
      const star = byStar.get(entries[i].star);
      if (!star || shown.has(star.index)) continue;
      await wait(Math.max(0, base - star.index * ramp) + randomInt(-30, 30));
      shown.add(star.index);
      this.revealSpecial(star);
    }
  }

  /**
   * 判断「到底有没有可以对齐的真实音乐时钟」。
   *
   * 优先用 audio.start() 的**明确结果**：
   *   · mode === "file"  → 音轨确实已经在播，等它进入可读取状态（很短），返回 true
   *   · 其它（synth / none）→ 立刻返回 false，明确进入无音乐降级
   * 这样就不会出现「明明已经确定没有音乐了，却还要傻等十几秒」。
   *
   * 没给 startResult（老的调用方式 / 单元测试）时，退回原来的轮询 + 有界超时：
   * 拿不到真实音轨、或已经确定回退到合成音乐，就返回 false。
   *
   * true  = 已经有权威的音乐时间可用
   * false = 音轨不可用 / 已回退到合成音乐 / 等超时了
   */
  waitForMusic(audio, startResult) {
    if (!audio || typeof audio.getMusicTime !== "function") return Promise.resolve(false);

    if (startResult) {
      return Promise.resolve(startResult)
        .then((r) => {
          if (!r || r.ok !== true || r.mode !== "file") return false;
          return this.waitTrackReadable(audio, birthdayConfig.timing.trackReadyTimeout ?? 1500);
        })
        .catch(() => false);
    }

    const timeoutMs = birthdayConfig.timing.specialStarWaitTimeout ?? 3000;
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

  /**
   * 音轨已经在播，但 currentTime 可能还要一两帧才可读（readyState 起来）。
   * 只等一个很短的、有明确上限的时间；用 setInterval 保证后台被节流时也有结论。
   */
  waitTrackReadable(audio, timeoutMs) {
    if (audio.isTrackPlaying()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t0 = performance.now();
      const timer = setInterval(() => {
        if (audio.isTrackPlaying() || performance.now() - t0 > timeoutMs) {
          clearInterval(timer);
          resolve(audio.isTrackPlaying());
        }
      }, 40);
    });
  }

  dim() {
    this.stars.forEach((s) => {
      s.element.style.transition = "opacity 1.5s ease";
      s.element.style.opacity = "0.25";
    });
  }
}
