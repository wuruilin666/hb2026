// 背景音乐：
// 1) 若在 config.js 里设置了 music.src（如 "assets/bgm.mp3"），就用这个音频文件播放，
//    并按阶段做音量变化（星空轻 → 插蜡烛稍响 → 吹气时压低 → 烟花最响 → 尾声收小）。
// 2) 若没有设置，或文件加载/播放失败，自动回退到内置的 Web Audio 合成氛围音乐。
// 两种模式都会保留音效（插蜡烛的八音盒声、烟花的低沉爆响）。

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

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.started = false;

    // 文件模式
    this.el = null;
    this.useFile = false;
    this.volRaf = 0;

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

  async start() {
    if (this.started) return;

    // 先在用户手势内把 <audio> 建好并调用 play()，移动端才不会被拦
    const src = this.music.src;
    let el = null;
    let playPromise = null;
    if (src) {
      el = this.createEl(src);
      try { playPromise = el.play(); } catch (e) { playPromise = Promise.resolve(false); }
      // 先挂一个空的 catch：若浏览器拦截自动播放，也不会产生未处理的 Promise 报错
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      this.ctx = new AudioCtx();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.ctx.destination);
    }

    // 优先使用用户自己的音乐文件
    if (el && this.ctx) {
      const ok = await this.awaitReady(el, 8000);
      try { await playPromise; } catch (e) {}
      if (ok) {
        this.el = el;
        this.useFile = true;
        this.started = true;
        this.fadeTo("stars", this.music.fadeIn ?? 4);
        return;
      }
      console.warn("[audio] 音乐文件不可用，改用内置合成音乐");
      try { el.pause(); } catch (e) {}
    }

    await this.startSynth();
    this.started = true;
    this.fadeTo("stars", 2.0);
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

  // 等待音频可读；超时或出错返回 false
  awaitReady(el, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        el.removeEventListener("canplay", onReady);
        el.removeEventListener("playing", onReady);
        el.removeEventListener("error", onFail);
        resolve(ok);
      };
      const onReady = () => finish(true);
      const onFail = () => finish(false);
      const timer = setTimeout(() => finish(false), timeoutMs);
      el.addEventListener("canplay", onReady);
      el.addEventListener("playing", onReady);
      el.addEventListener("error", onFail);
    });
  }

  rampElementVolume(target, seconds) {
    const el = this.el;
    if (!el) return;
    const from = el.volume;
    const dur = Math.max(0.1, seconds) * 1000;
    const t0 = performance.now();
    cancelAnimationFrame(this.volRaf);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.volume = Math.max(0, Math.min(1, from + (target - from) * p));
      if (p < 1) this.volRaf = requestAnimationFrame(step);
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
