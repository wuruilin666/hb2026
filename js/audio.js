// Warm ambient pad generated with Web Audio: slow chord progression,
// gentle sine voices, soft lowpass filter with LFO, and subtle music-box chimes.

const CHORD_PROGRESSION = [
  // [frequency Hz, detune cents] per voice (3-4 voices per chord)
  // vi - Am
  [[220.00, -4], [261.63, 3], [329.63, -2], [493.88, 5]],
  // IV - Fmaj7
  [[174.61, 4], [220.00, -3], [261.63, -5], [349.23, 2]],
  // I - Cmaj7
  [[261.63, -3], [329.63, 4], [392.00, -2], [493.88, 3]],
  // V - G6
  [[196.00, 3], [246.94, -4], [293.66, 2], [440.00, -3]]
];

const CHORD_DURATION = 11; // seconds per chord

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.padGain = null;
    this.filter = null;
    this.lfo = null;
    this.lfoGain = null;
    this.voices = [];
    this.chordTimer = null;
    this.chordIndex = 0;
    this.started = false;
    this.muted = false;
    this.moodGains = {
      intro: { vol: 0 },
      stars: { vol: 0.18 },
      cat: { vol: 0.24 },
      candle: { vol: 0.30 },
      blow: { vol: 0.14 },
      firework: { vol: 0.22 },
      ending: { vol: 0.20 }
    };
  }

  async start() {
    if (this.started) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // Lowpass filter with slow LFO for movement
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 600;
    this.filter.Q.value = 0.6;
    this.filter.connect(this.master);

    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.55;
    this.padGain.connect(this.filter);

    // LFO modulates filter cutoff between 350 and 1100 Hz
    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.value = 0.08;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 380;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);
    this.lfo.start();

    // Start the first chord
    this.playChord(this.chordIndex);
    this.chordTimer = setInterval(() => {
      this.chordIndex = (this.chordIndex + 1) % CHORD_PROGRESSION.length;
      this.crossfadeToChord(this.chordIndex);
    }, CHORD_DURATION * 1000);

    this.fadeTo("stars", 2.0);
    this.started = true;
  }

  playChord(index) {
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
      g.gain.linearRampToValueAtTime(0.18 - i * 0.03, t + 3.5); // slow swell
      osc.connect(g);
      g.connect(this.padGain);
      osc.start(t);
      this.voices.push({ osc, gain: g });
    });
  }

  crossfadeToChord(index) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Fade out current voices
    const old = this.voices;
    old.forEach(({ osc, gain }) => {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + 2.0);
      try { osc.stop(t + 2.2); } catch (e) {}
    });
    // Start new chord after brief crossfade
    setTimeout(() => this.playChord(index), 1800);
  }

  fadeTo(mood, duration = 1.5) {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    const target = (this.moodGains[mood] || this.moodGains.stars).vol;
    this.master.gain.setTargetAtTime(target, t, duration * 0.4);
  }

  setMood(mood) {
    this.fadeTo(mood);
  }

  // Soft music-box chime: random chord-tone, gentle sine with quick decay
  chime() {
    if (!this.ctx || !this.started) return;
    const chord = CHORD_PROGRESSION[this.chordIndex];
    const [freq] = chord[Math.floor(Math.random() * chord.length)];
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * 2; // octave up for sparkle

    // Add a subtle second harmonic
    const osc2 = this.ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 3;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);

    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.03, t + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 1.0);

    osc.connect(g);
    osc2.connect(g2);
    g.connect(this.filter);
    g2.connect(this.filter);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 1.7);
    osc2.stop(t + 1.1);
  }

  // Soft low boom for fireworks (less harsh than before)
  boom() {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 1.2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2.8);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.10, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 500;
    noiseFilter.Q.value = 0.8;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.master);
    noise.start(t);
    noise.stop(t + 1.1);

    // Soft sine sub
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.10, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.8);
  }

  stop() {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(0, t, 0.6);
      if (this.chordTimer) clearInterval(this.chordTimer);
      setTimeout(() => {
        try { this.lfo && this.lfo.stop(); } catch (e) {}
        this.voices.forEach((v) => { try { v.osc.stop(); } catch (e) {} });
        this.ctx.close();
      }, 900);
    } catch (e) {}
  }
}