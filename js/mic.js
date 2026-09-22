import { wait } from "./utils.js";

/**
 * 吹蜡烛用的麦克风检测。
 *
 * 兼容性要点（改动原因）：
 *  1. 不再自己 new 一个 AudioContext，而是借用 AudioManager 已有的那一个。
 *     iOS / WebKit 上「播背景音乐」和「麦克风录音」若是两个 AudioContext，
 *     系统会把它们当成两路音频会话来回切 —— 表现为 BGM 短暂停止、恢复后音量异常。
 *  2. 需要 Audio Session API 的浏览器（Safari 16.4+）在录音期间显式声明
 *     play-and-record，告诉系统"这是播放 + 录音共存"，避免 BGM 被判为被打断。
 *     用特性检测，不支持的浏览器（如桌面 Chrome）一行都不会执行。
 *  3. 录音开始/结束前后各检查一次：BGM 若被浏览器暂停，就接着**原位置**恢复，
 *     并把它拉回当前阶段的设计音量。全程不新建 <audio>、不重置 currentTime。
 */
export class MicBlow {
  constructor(audioManager) {
    this.audioManager = audioManager;
    this.stream = null;
    this.ctx = null;
    this.ownsCtx = false; // true = 这个 ctx 是自己建的，stop() 时才有权 close
    this.analyser = null;
    this.source = null;
    this.raf = null;
    this.running = false;
    this.blowCallbacks = [];
    this.trackSnap = null;      // 开麦前的 BGM 状态快照
    this.prevSessionType = null; // 开麦前的 audio session 类型
  }

  async requestMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 取 AudioContext：优先借用 AudioManager 的那个（全站唯一）。
   * 只有拿不到时才自己建一个，并记住"这个是我的"，结束时由自己 close。
   * 返回 null = 环境完全没有 Web Audio，调用方走兜底等待。
   */
  getContext() {
    const am = this.audioManager;
    let shared = null;
    if (am) {
      shared = typeof am.ensureContext === "function" ? am.ensureContext() : am.ctx || null;
      if (shared && shared.state === "closed") shared = null;
    }
    if (shared) {
      this.ownsCtx = false;
      return shared;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    this.ownsCtx = true;
    return new AudioCtx();
  }

  /**
   * Audio Session API（Safari 16.4+，桌面 Chrome 没有）。
   * 录音 + 播放共存时必须显式声明 play-and-record，否则系统可能把 BGM 当成
   * "被麦克风打断的音频"而暂停或压低它。
   * 全程特性检测；不支持的浏览器直接跳过，行为与改动前完全一致。
   */
  enterRecordingSession() {
    if (!("audioSession" in navigator) || !navigator.audioSession) return false;
    try {
      this.prevSessionType = navigator.audioSession.type || "auto";
      navigator.audioSession.type = "play-and-record";
      return true;
    } catch (e) {
      return false;
    }
  }

  exitRecordingSession() {
    if (this.prevSessionType == null) return false;
    try {
      navigator.audioSession.type = this.prevSessionType;
    } catch (e) {
      /* 忽略：不影响剧情 */
    }
    this.prevSessionType = null;
    return true;
  }

  /**
   * 背景音乐若被浏览器暂停（麦克风导致的 audio session 切换），接着原位置继续；
   * 并把音量拉回"当前阶段"的设计目标，避免恢复后音量偏大/偏小。
   * 不新建音频元素、不改 currentTime，所以星星依赖的音乐时间轴不受影响。
   */
  resumeBackgroundMusic() {
    const am = this.audioManager;
    if (!am) return false;
    if (typeof am.restoreTrack === "function") am.restoreTrack(this.trackSnap);
    if (typeof am.reassertVolume === "function") am.reassertVolume();
    return true;
  }

  async listen(fallbackMs = 5200) {
    // 开麦前先把 BGM 的真实状态记下来（只读），事后再决定要不要恢复
    this.trackSnap = this.audioManager && this.audioManager.snapshotTrack
      ? this.audioManager.snapshotTrack()
      : null;
    this.enterRecordingSession();

    const ok = await this.requestMic();
    if (!ok) {
      this.exitRecordingSession();
      await wait(fallbackMs);
      return "timeout";
    }

    const ctx = this.getContext();
    if (!ctx) {
      this.releaseStream();
      this.exitRecordingSession();
      await wait(fallbackMs);
      return "timeout";
    }
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch (e) {}
    }

    this.ctx = ctx;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.source = ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);

    // 麦克风就绪后立刻看一眼 BGM：如果它已经被浏览器暂停，马上接着原位置恢复，
    // 别让整个吹蜡烛过程都静着。
    this.resumeBackgroundMusic();

    this.running = true;
    const data = new Uint8Array(this.analyser.fftSize);
    let loudFrames = 0;
    const threshold = 0.045;
    const zcrThreshold = 0.08;
    const requiredFrames = 5;

    return new Promise((resolve) => {
      const finish = (reason) => {
        clearTimeout(fallbackTimer);
        this.stop();
        // 录音会话结束：恢复 audio session 类型，再确认真的一次 BGM 状态
        this.exitRecordingSession();
        this.resumeBackgroundMusic();
        resolve(reason);
      };

      const fallbackTimer = setTimeout(() => finish("timeout"), fallbackMs);

      const check = () => {
        if (!this.running) return;
        this.analyser.getByteTimeDomainData(data);

        let sum = 0;
        let zcr = 0;
        let prev = data[0] / 128 - 1;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] / 128 - 1;
          sum += v * v;
          if (i > 0 && prev * v < 0) zcr++;
          prev = v;
        }
        const rms = Math.sqrt(sum / data.length);
        const zcrRate = zcr / data.length;

        if (rms > threshold && zcrRate > zcrThreshold) {
          loudFrames++;
          if (loudFrames >= requiredFrames) {
            finish("blow");
            return;
          }
        } else {
          loudFrames = Math.max(0, loudFrames - 1);
        }

        this.raf = requestAnimationFrame(check);
      };

      this.raf = requestAnimationFrame(check);
    });
  }

  releaseStream() {
    if (this.stream) {
      try {
        this.stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        /* 忽略 */
      }
    }
    this.stream = null;
  }

  /**
   * 只停麦克风：断开 analyser、停掉 stream。
   * 借来的 AudioContext（AudioManager 的那个）**绝不能 close** ——
   * 背景音乐和音效都用着它；close 会把 BGM 一起弄死。
   */
  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.source) {
      try { this.source.disconnect(); } catch (e) {}
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch (e) {}
    }
    this.releaseStream();
    if (this.ctx && this.ownsCtx && this.ctx.state !== "closed") {
      try { this.ctx.close(); } catch (e) {}
    }
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.ownsCtx = false;
  }
}
