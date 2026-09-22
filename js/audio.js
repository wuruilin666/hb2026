// 背景音乐：
// 1) 若在 config.js 里设置了 music.src（如 "assets/bgm.mp3"），就用这个音频文件播放，
//    并按阶段做音量变化（星空轻 → 插蜡烛稍响 → 吹气时压低 → 烟花最响 → 尾声收小）。
// 2) 若没有设置，或文件加载/播放失败，自动回退到内置的 Web Audio 合成氛围音乐。
// 两种模式都会保留音效（插蜡烛的八音盒声、烟花的低沉爆响）。
//
// 启动是「有明确结果」的：start() 永远不 reject，而是返回
//   { ok: true,  mode: "file" }  真实音轨已经在播
//   { ok: true,  mode: "synth" } 已回退到内置合成音乐
//   { ok: false, mode: "none" }  两条路都没建立起来（调用方必须按「无音乐」处理）
// 并且每一步都有硬超时 —— 不允许出现「Promise 永不 settle，页面像卡死」。

import { birthdayConfig } from "./config.js";

const CHORD_PROGRESSION = [
  // vi - Am
  [[220.00, -4], [261.63, 3], [329.63, -2], [493.88, 5]],
  // IV - Fmaj7
  [[174.61, 4], [220.00, -3], [261.63, -5], [349.23, 2]],
  // I - Cmaj7
  [[261.63, -3], [329.63, 4], [392.00, -2], [493.88, 3]],
  // V - G6
  [[196.00, 3], [246.94, -4], [293.66, 2], [440.00, -3]]
];
const CHORD_DURATION = 11; // 秒/和弦

/**
 * 给一个 Promise 加超时。**永远 resolve，绝不对调用方抛。**
 *   { settled: true,  ok: true }              在超时前成功
 *   { settled: true,  ok: false, error }      在超时前失败
 *   { settled: false, ok: false, timeout: true } 超时（原 Promise 仍未定）
 *
 * 为什么必须加：play() / AudioContext.resume() 返回的 Promise 在部分 WebView 上
 * 既不 resolve 也不 reject（音频会话没准备好、被系统挂着）。没有超时就只能无限等，
 * 而用户看到的就是「点完开始，页面像卡死」。
 */
function settleWithin(promise, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish({ settled: false, ok: false, timeout: true }), Math.max(1, ms));
    Promise.resolve(promise).then(
      () => { clearTimeout(timer); finish({ settled: true, ok: true }); },
      (error) => { clearTimeout(timer); finish({ settled: true, ok: false, error }); }
    );
  });
}

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.started = false;

    // 文件模式
    this.el = null;
    this.useFile = false;
    this.volRaf = 0;
    // 当前阶段（mood）。音量被打断 / 被系统改过之后，用它把音量拉回设计目标。
    this.currentMood = "stars";

    // 启动状态
    this.startInFlight = null;  // 同一次启动只跑一遍
    this.lastResult = null;     // 上次 start() 的结果，重复调用直接复用

    // 合成模式
    this.synthGain = null;
    this.padGain = null;
    this.filter = null;
    this.lfo = null;
    this.lfoGain = null;
    this.voices = [];
    this.chordTimer = null;
    this.chordIndex = 0;

    // 音效
    this.sfx = null;

    this.synthMoods = {
      intro: 0,
      stars: 0.18,
      cat: 0.24,
      candle: 0.30,
      blow: 0.14,
      firework: 0.22,
      ending: 0.20
    };
  }

  get music() {
    return birthdayConfig.music || {};
  }

  /** 启动预算（毫秒）：超过就明确判定这一条路失败，绝不允许无限等 */
  get startBudget() {
    return birthdayConfig.timing.audioStartTimeout ?? 3000;
  }

  /**
   * 真正在播放的音乐时间（秒）—— 音乐驱动动画的唯一时钟。
   *
   * - 用真实音轨时 = <audio>.currentTime（歌曲自身的时间轴）
   * - 还没起播 / 被浏览器暂停 / 已回退到合成音乐时 = null
   *
   * 不要用 setTimeout 去模拟音乐里的时间点：加载快慢、手机性能、掉帧、
   * 首次播放延迟都会让两者错开；currentTime 永远说的是「真正播到哪了」。
   */
  getMusicTime() {
    if (!this.useFile || !this.el) return null;
    if (this.el.paused || this.el.ended) return null;
    if (this.el.readyState < 2) return null; // 还没有可播放的数据
    return this.el.currentTime;
  }

  /** 是否有真实音轨正在播放（false = 还没起播，或已经回退到合成音乐） */
  isTrackPlaying() {
    return this.getMusicTime() != null;
  }

  /** 音轨已加载但被浏览器拦下自动播放时，在任意一次用户手势里再试一次 play() */
  resumeTrack() {
    if (!this.useFile || !this.el || !this.el.paused) return;
    const p = this.el.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  /**
   * 全站唯一的 AudioContext（不存在时才创建）。麦克风检测也复用它。
   *
   * 为什么必须只有一个：iOS / WebKit 上，「播放背景音乐」和「麦克风录音」如果来自两个
   * 不同的 AudioContext，系统会把它们当成两路音频会话来回切：背景音乐会短暂停止，
   * 恢复时输出路由 / 音量也可能变一下（听感就是"声音突然变大"）。
   *
   * **不会抛异常**：某些 WebView 在音频资源被占用 / 数量超限时 `new AudioContext()`
   * 会直接抛错。抛出去会连麦克风检测一起弄坏，所以这里统一转成「返回 null」。
   */
  ensureContext() {
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      this.ctx = new AudioCtx();
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.ctx.destination);
      return this.ctx;
    } catch (e) {
      console.warn("[audio] AudioContext 创建失败", e);
      this.ctx = null;
      this.sfx = null;
      return null;
    }
  }

  /**
   * 记录背景音乐「此刻的真实状态」，供可能打断播放的操作（如开麦克风）前后对照。
   * 只读，不改任何东西。
   */
  snapshotTrack() {
    if (!this.useFile || !this.el) return null;
    return {
      wasPlaying: !this.el.paused && !this.el.ended,
      time: this.el.currentTime,
      volume: this.el.volume
    };
  }

  /**
   * 原本在播、却被浏览器暂停了（典型场景：麦克风启动触发 audio session 切换）
   * 就接着**原位置**继续播。
   *
   * 只调 `el.play()`：不新建元素、不重置 currentTime、不重头开始，
   * 所以特殊星星依赖的音乐时间轴不受影响。
   * 返回 true 表示这次真的恢复了一次播放。
   */
  restoreTrack(snap) {
    if (!snap || !snap.wasPlaying) return false;
    if (!this.useFile || !this.el) return false;
    if (!this.el.paused) return false;
    try {
      const p = this.el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) {
      return false;
    }
    return true;
  }

  /**
   * 把背景音乐音量**立刻**压回「当前阶段」的设计目标（0.6 × phases[mood]）。
   *
   * 用在被打断 / 恢复之后：既不为麦克风额外压低，也不让被系统改过的音量留在原地，
   * 从而避免"恢复后音量突然变大/变小"。不走渐变（不会叠出新的 ramp），
   * 也不改任何阶段音量配置 —— 只是把当前阶段本来就该有的那个值重新写一遍。
   */
  reassertVolume() {
    if (!this.useFile || !this.el) return;
    const phases = this.music.phases || {};
    const scale = phases[this.currentMood] ?? 1;
    const target = Math.max(0, Math.min(1, (this.music.volume ?? 0.6) * scale));
    cancelAnimationFrame(this.volRaf);
    this.volRaf = 0;
    this.el.volume = target;
  }

  // ---------- 启动 ----------

  /**
   * 启动音频。**永远不 reject**，启动结果只能通过返回值判断：
   *
   *   { ok: true,  mode: "file" }   真实音轨已经在播 → getMusicTime() 可用
   *   { ok: true,  mode: "synth" }  已回退到内置合成音乐 → getMusicTime() 返回 null
   *   { ok: false, mode: "none", reason: "..." }  两条路都没建立起来
   *
   * 为什么不 reject：音频起不来（被自动播放策略拦、WebView 音频会话异常、
   * 文件损坏、resume() 被拒…）是**可预期的分支**，不是异常。用 catch 吞掉它，
   * 剧情就会在「其实没有音乐」的状态下继续跑，用户只会看到页面卡住而且不知道为什么。
   *
   * 幂等：已经在跑就直接回报当前状态；同一次启动只执行一遍，不会建出第二个 <audio>。
   * 因此它也可以安全地在用户手势里重试（见 main.js 的失败提示）。
   */
  async start() {
    if (this.started) {
      return this.lastResult || { ok: true, mode: this.useFile ? "file" : "synth" };
    }
    if (this.startInFlight) return this.startInFlight;

    this.startInFlight = this.startOnce();
    let result;
    let thrown = null;
    try {
      result = await this.startInFlight;
    } catch (e) {
      // 兜底：startOnce 里所有已知失败路径都已转成返回值，真出现意外异常也不能
      // 让调用方拿到 reject —— 否则又会退回「错误被吞掉、剧情假装正常」。
      thrown = e;
      result = { ok: false, mode: "none", reason: "unexpected-error" };
      console.warn("[audio] start() 出现意外异常", e);
    } finally {
      this.startInFlight = null;
    }
    this.lastResult = result;
    if (thrown) this.lastResult.error = thrown;
    return result;
  }

  async startOnce() {
    const budget = this.startBudget;
    const deadline = performance.now() + budget;
    const remaining = () => Math.max(150, deadline - performance.now());
    const reasons = [];

    // ---- 1) 先在同一个手势任务里把全站唯一的 AudioContext 建好（同步、不 await）----
    // 顺序很重要：**先建 AudioContext，再起播音轨**。
    // iOS / WebKit 上「新建 AudioContext」会切换音频会话，如果此刻 <audio> 已经在播，
    // 系统可能直接把它打断 —— 表现就是「点了开始却没有背景音乐」。
    // 两者都在同一个同步块里，所以都还在用户手势的这一次任务内，移动端不会拦自动播放。
    const ctx = this.ensureContext();
    if (!ctx) {
      reasons.push(window.AudioContext || window.webkitAudioContext ? "audio-context-failed" : "no-webaudio");
    }

    // resume() 只发起、不在这里 await：await 它会占住手势任务，把下面的 play()
    // 推迟到手势之外，反而可能被自动播放策略拦下。
    let resumeP = null;
    if (ctx && ctx.state !== "running") {
      try {
        resumeP = Promise.resolve(ctx.resume());
      } catch (e) {
        resumeP = Promise.reject(e);
      }
      // 先挂一个空的 catch，避免未处理的 Promise 报错
      resumeP.catch(() => {});
    }

    // ---- 2) 同一手势任务内立刻起播音轨 ----
    let el = null;
    let playP = null;
    if (this.music.src) {
      try {
        el = this.createEl(this.music.src);
        playP = el.play();
        // 先挂一个空的 catch，避免未处理的 Promise 报错；
        // 真正的失败日志在下面按 settleWithin 的结果统一打一次，不重复打。
        if (playP && typeof playP.catch === "function") playP.catch(() => {});
      } catch (e) {
        console.warn("[audio] file playback failed", e);
        playP = null;
      }
    } else {
      reasons.push("no-music-src");
    }

    // ---- 3) 只认「音轨真的开始播放」 ----
    // 不能用 canplay / loadeddata 判断：那只说明文件读得出来、能播，
    // 不代表已经出声。play() 的 Promise resolve 才代表播放已经开始；
    // 同时再确认 paused 真的变成了 false（少数 WebView 会晚一两帧）。
    let fileOk = false;
    if (el && playP) {
      const r = await settleWithin(playP, remaining());
      if (!r.ok) {
        console.warn(
          "[audio] file playback failed",
          r.timeout ? `play() ${budget}ms 内既没有 resolve 也没有 reject` : r.error
        );
        reasons.push(r.timeout ? "play-timeout" : "play-rejected");
      } else if (!(await this.waitPlaybackStarted(el, Math.min(600, remaining())))) {
        console.warn("[audio] file playback failed: play() 已 resolve，但音频并没有真的在播");
        reasons.push("play-not-started");
      } else {
        fileOk = true;
      }
    }

    // ---- 4) 音轨可用 → file mode ----
    if (fileOk) {
      this.el = el;
      this.useFile = true;
      this.started = true;
      // 音轨已经在播了才设音量，保证 fadeIn 的那几个点都对得上
      this.fadeTo("stars", this.music.fadeIn ?? 4);
      return { ok: true, mode: "file" };
    }

    // 音轨没成功：把它彻底停掉，别留一个「过一会儿自己响起来」的元素
    if (el) {
      try { el.pause(); } catch (e) {}
      try { el.removeAttribute("src"); el.load(); } catch (e) {}
    }

    // ---- 5) 等 AudioContext 真的进入 running（同样有超时，失败不抛）----
    let ctxRunning = !!ctx && ctx.state === "running";
    if (ctx && !ctxRunning && resumeP) {
      const r = await settleWithin(resumeP, remaining());
      ctxRunning = ctx.state === "running";
      if (!ctxRunning) {
        console.warn(
          "[audio] AudioContext resume failed",
          r.timeout ? `${budget}ms 内 resume() 没有 settle` : r.error || `state=${ctx.state}`
        );
        reasons.push(r.timeout ? "resume-timeout" : "resume-failed");
      }
    } else if (ctx && !ctxRunning) {
      reasons.push("context-suspended");
    }

    // ---- 6) 回退到内置合成音乐 ----
    console.warn("[audio] falling back to synth");
    if (ctxRunning) {
      try {
        await this.startSynth();
      } catch (e) {
        console.warn("[audio] synth failed", e);
        this.synthGain = null;
      }
      if (this.synthGain && this.ctx && this.ctx.state === "running") {
        this.el = null;
        this.useFile = false;
        this.started = true;
        this.fadeTo("stars", 2.0);
        return { ok: true, mode: "synth" };
      }
      reasons.push("synth-failed");
    }

    // ---- 7) 两条路都没起来：明确失败，绝不假装有音乐 ----
    console.warn("[audio] audio unavailable:", reasons.join("+") || "unknown");
    this.el = null;
    this.useFile = false;
    this.started = false;
    return { ok: false, mode: "none", reason: reasons.join("+") || "unknown" };
  }

  /**
   * play() 的 Promise resolve 只保证「已经开始播放」。少数 WebView 上 paused
   * 会晚一两帧才变 false，这里给一个很短、且有明确上限的宽限；
   * 用 setInterval 而不是 rAF，保证后台 / 被节流时也一定会有结论。
   */
  waitPlaybackStarted(el, graceMs) {
    const started = () => !el.paused && !el.ended && el.readyState >= 2;
    if (started()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t0 = performance.now();
      const timer = setInterval(() => {
        if (started() || el.error || performance.now() - t0 > graceMs) {
          clearInterval(timer);
          resolve(started());
        }
      }, 50);
    });
  }

  // ---------- 文件模式 ----------

  createEl(src) {
    const el = new Audio();
    if (/^https?:\/\//i.test(src)) el.crossOrigin = "anonymous";
    el.src = src;
    el.loop = this.music.loop !== false;
    el.preload = "auto";
    el.volume = 0;
    return el;
  }

  rampElementVolume(target, seconds) {
    const el = this.el;
    if (!el) return;
    const from = el.volume;
    const dur = Math.max(0.1, seconds) * 1000;
    const t0 = performance.now();
    // 任何时刻只允许一条音量渐变在跑：先彻底取消上一条（含它的 volRaf 句柄）
    cancelAnimationFrame(this.volRaf);
    this.volRaf = 0;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.volume = Math.max(0, Math.min(1, from + (target - from) * p));
      if (p < 1) this.volRaf = requestAnimationFrame(step);
      else this.volRaf = 0;
    };
    this.volRaf = requestAnimationFrame(step);
  }

  // ---------- 合成模式 ----------

  async startSynth() {
    if (!this.ctx) return;

    this.synthGain = this.ctx.createGain();
    this.synthGain.gain.value = 0;
    this.synthGain.connect(this.ctx.destination);

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 600;
    this.filter.Q.value = 0.6;
    this.filter.connect(this.synthGain);

    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.55;
    this.padGain.connect(this.filter);

    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.value = 0.08;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 380;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);
    this.lfo.start();

    this.playChord(this.chordIndex);
    this.chordTimer = setInterval(() => {
      this.chordIndex = (this.chordIndex + 1) % CHORD_PROGRESSION.length;
      this.crossfadeToChord(this.chordIndex);
    }, CHORD_DURATION * 1000);
  }

  playChord(index) {
    if (!this.ctx || !this.padGain) return;
    const chord = CHORD_PROGRESSION[index];
    const t = this.ctx.currentTime;
    this.voices = [];
    chord.forEach(([freq, detune], i) => {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18 - i * 0.03, t + 3.5);
      osc.connect(g);
      g.connect(this.padGain);
      osc.start(t);
      this.voices.push({ osc, gain: g });
    });
  }

  crossfadeToChord(index) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const old = this.voices;
    old.forEach(({ osc, gain }) => {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + 2.0);
      try { osc.stop(t + 2.2); } catch (e) {}
    });
    setTimeout(() => this.playChord(index), 1800);
  }

  // ---------- 统一接口 ----------

  fadeTo(mood, duration = 1.5) {
    // 当前阶段先记下来：音频没能启动时，它也是「重试成功后该回到哪一档」的唯一依据
    this.currentMood = mood;
    if (!this.started) return;
    if (this.useFile) {
      const phases = this.music.phases || {};
      const scale = phases[mood] ?? 1;
      this.rampElementVolume((this.music.volume ?? 0.6) * scale, duration);
      return;
    }
    if (!this.ctx || !this.synthGain) return;
    const t = this.ctx.currentTime;
    const target = this.synthMoods[mood] ?? this.synthMoods.stars;
    this.synthGain.gain.setTargetAtTime(target, t, duration * 0.4);
  }

  setMood(mood) {
    this.fadeTo(mood);
  }

  // 八音盒式轻响（插蜡烛时）
  chime() {
    if (!this.ctx || !this.sfx) return;
    const chord = CHORD_PROGRESSION[this.chordIndex];
    const [freq] = chord[Math.floor(Math.random() * chord.length)];
    const t = this.ctx.currentTime;

    const mk = (f, peak, dur, dest) => {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(dest);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    };
    mk(freq * 2, 0.08, 1.6, this.sfx);
    mk(freq * 3, 0.03, 1.0, this.sfx);
  }

  // 烟花低沉爆响
  boom() {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;

    const bufferSize = Math.floor(this.ctx.sampleRate * 1.2);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2.8);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.1, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 500;
    noiseFilter.Q.value = 0.8;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.sfx);
    noise.start(t);
    noise.stop(t + 1.1);

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.connect(gain);
    gain.connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.8);
  }

  stop() {
    cancelAnimationFrame(this.volRaf);
    if (this.el) {
      this.rampElementVolume(0, 2.5);
      setTimeout(() => { try { this.el.pause(); } catch (e) {} }, 2600);
    }
    if (this.ctx) {
      try {
        if (this.synthGain) {
          this.synthGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
        }
        if (this.chordTimer) clearInterval(this.chordTimer);
        setTimeout(() => {
          try { this.lfo && this.lfo.stop(); } catch (e) {}
          this.voices.forEach((v) => { try { v.osc.stop(); } catch (e) {} });
          this.ctx.close();
        }, 900);
      } catch (e) {}
    }
    this.started = false;
  }
}
