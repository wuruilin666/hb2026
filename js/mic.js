import { wait } from "./utils.js";

export class MicBlow {
  constructor(audioManager) {
    this.audioManager = audioManager;
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.raf = null;
    this.running = false;
    this.blowCallbacks = [];
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

  async listen(fallbackMs = 5200) {
    const ok = await this.requestMic();
    if (!ok) {
      await wait(fallbackMs);
      return "timeout";
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    await this.ctx.resume();

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);

    this.running = true;
    const data = new Uint8Array(this.analyser.fftSize);
    let loudFrames = 0;
    const threshold = 0.045;
    const zcrThreshold = 0.08;
    const requiredFrames = 5;

    return new Promise((resolve) => {
      const fallbackTimer = setTimeout(() => {
        this.stop();
        resolve("timeout");
      }, fallbackMs);

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
            clearTimeout(fallbackTimer);
            this.stop();
            resolve("blow");
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

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.source) {
      try { this.source.disconnect(); } catch (e) {}
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }
    if (this.ctx && this.ctx.state !== "closed") {
      try { this.ctx.close(); } catch (e) {}
    }
    this.stream = null;
    this.source = null;
    this.ctx = null;
  }
}
