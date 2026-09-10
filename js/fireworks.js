import { birthdayConfig } from "./config.js";
import { wait, random, clamp } from "./utils.js";

// 日式花火大会调色板
const COLORS = [
  "#ffcf6b", // 金
  "#ff8a4d", // 橙
  "#ff4f6d", // 桃
  "#9b6cff", // 紫
  "#5fd6c2", // 翡翠
  "#ffffff", // 白
  "#ffd1a4", // 杏
  "#ff6b9b"  // 粉
];

const BURST_TYPES = ["peony", "chrysanthemum", "willow", "ring", "crown"];

class Particle {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.type = opts.type || "spark";
    this.target = opts.target || null;
    this.color = opts.color || COLORS[Math.floor(Math.random() * COLORS.length)];
    this.size = opts.size ?? random(1.4, 2.8);
    this.vx = opts.vx ?? 0;
    this.vy = opts.vy ?? 0;
    this.life = opts.life ?? 1;
    this.decay = opts.decay ?? 0.005;
    this.gravity = opts.gravity ?? 0.05;
    this.drag = opts.drag ?? 0.965;
    this.trail = !!opts.trail;
    this.trailLen = opts.trailLen ?? 0;

    if (this.type === "rocket") {
      const angle = -Math.PI / 2 + random(-0.1, 0.1);
      const speed = random(7.5, 12);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.size = random(1.4, 2.2);
      this.trail = true;
      this.trailLen = 8;
      this.life = 1;
      this.decay = 0;
      this.exploded = false;
    } else if (this.type === "drift") {
      // 烟花余光从爆炸位置漂到目标点，停留，再向上飘散成星
      this.startX = x;
      this.startY = y;
      this.t = 0;
      this.driftSpeed = opts.driftSpeed ?? 0.025;
      this.phase = "travel";
      this.holdTime = 0;
      this.twinklePhase = random(0, Math.PI * 2);
      this.life = 1;
      this.decay = 0;
      this.gravity = 0;
      this.drag = 1;
    } else if (this.type === "spark") {
      this.life = 1;
    }
  }

  update() {
    if (this.type === "drift") {
      if (this.phase === "travel") {
        this.t += this.driftSpeed;
        if (this.t >= 1) { this.t = 1; this.phase = "hold"; }
        const eased = 1 - Math.pow(1 - this.t, 3);
        this.x = this.startX + (this.target.x - this.startX) * eased;
        this.y = this.startY + (this.target.y - this.startY) * eased;
        return true;
      }
      if (this.phase === "hold") {
        this.holdTime++;
        this.x = this.target.x + Math.sin((this.holdTime + this.twinklePhase) * 0.15) * 0.7;
        this.y = this.target.y + Math.cos((this.holdTime + this.twinklePhase) * 0.18) * 0.7;
        this.life = 0.78 + Math.sin((this.holdTime + this.twinklePhase) * 0.22) * 0.22;
        return true;
      }
      if (this.phase === "rise") {
        this.y += this.vy;
        this.x += this.vx;
        this.vx *= 0.985;
        this.vy *= 0.985;
        this.vy -= 0.015; // 持续向上加速（轻微）
        this.life -= 0.009;
        return this.life > 0;
      }
      return true;
    }

    if (this.type === "rocket") {
      this.x += this.vx;
      this.y += this.vy;
      this.vy *= 0.99;
      if (this.vy > -1.0) {
        this.exploded = true;
        this.life = 0;
        return false;
      }
      return true;
    }

    // spark
    this.x += this.vx;
    this.y += this.vy;
    if (this.gravity) this.vy += this.gravity;
    this.vx *= this.drag;
    this.vy *= this.drag;
    this.life -= this.decay;
    return this.life > 0;
  }

  draw(ctx) {
    ctx.globalAlpha = clamp(this.life, 0, 1);
    if (this.trail && this.trailLen > 0) {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.size;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(this.x - this.vx * 1.6, this.y - this.vy * 1.6);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      if (this.size > 1.6) {
        ctx.globalAlpha = clamp(this.life * 0.32, 0, 0.32);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

// 中心闪光 + 光晕：每个大中型爆炸的一瞬
class Flash {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.life = 1;
    this.maxRadius = opts.radius ?? 60;
    this.color = opts.color ?? "#fff";
  }
  update() {
    this.life -= 0.06;
    return this.life > 0;
  }
  draw(ctx) {
    const t = 1 - this.life;
    const r = this.maxRadius * (0.3 + t * 0.7);
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
    grad.addColorStop(0, this.color);
    grad.addColorStop(0.35, this.color + "80");
    grad.addColorStop(1, this.color + "00");
    ctx.globalAlpha = this.life * 0.85;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export class Fireworks {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.particles = [];
    this.flashes = [];
    this.burstHistory = []; // 最近几次爆炸的中心
    this.raf = null;
    this.width = 0;
    this.height = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // 把 "20" 渲到离屏 canvas，再撒点采样得到目标点列表
  getTargets() {
    const c = document.createElement("canvas");
    c.width = this.width;
    c.height = this.height;
    const x = c.getContext("2d");
    const fontSize = Math.min(this.width * 0.52, this.height * 0.42, 360);
    x.font = `bold ${fontSize}px Georgia, serif`;
    x.fillStyle = "#fff";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText("20", this.width / 2, this.height * 0.42);
    const image = x.getImageData(0, 0, this.width, this.height);
    const data = image.data;
    const points = [];
    const step = Math.max(5, Math.floor(fontSize / 30));
    for (let py = 0; py < this.height; py += step) {
      for (let px = 0; px < this.width; px += step) {
        const idx = (py * this.width + px) * 4;
        if (data[idx + 3] > 120) {
          points.push({ x: px, y: py });
        }
      }
    }
    return points;
  }

  spawnRocket() {
    const x = random(this.width * 0.08, this.width * 0.92);
    this.particles.push(new Particle(x, this.height, { type: "rocket" }));
  }

  // sizeFactor: 0.55 小型、1.0 中型、1.6 大型
  explode(x, y, type = "peony", sizeFactor = 1) {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const baseCount = type === "willow" ? 80 : type === "ring" ? 60 : 70;
    const count = Math.floor(baseCount * sizeFactor);

    if (sizeFactor >= 0.9) {
      this.flashes.push(new Flash(x, y, { radius: 40 + sizeFactor * 50, color }));
    }

    for (let i = 0; i < count; i++) {
      let angle, speed;
      if (type === "ring") {
        angle = (i / count) * Math.PI * 2;
        speed = (5 + sizeFactor * 2.5);
      } else if (type === "willow") {
        angle = -Math.PI / 2 + random(-Math.PI / 2.2, Math.PI / 2.2);
        speed = random(1.8, 4) * sizeFactor;
      } else if (type === "chrysanthemum") {
        angle = random(0, Math.PI * 2);
        speed = random(4.5, 7.5) * sizeFactor;
      } else if (type === "crown") {
        const isSpike = i % 3 === 0;
        angle = (i / count) * Math.PI * 2;
        speed = isSpike ? (8 + sizeFactor * 2) : (5 + sizeFactor * 1.5);
      } else {
        // peony
        angle = random(0, Math.PI * 2);
        speed = random(3.5, 6.5) * sizeFactor;
      }
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const isWillow = type === "willow";
      const p = new Particle(x, y, {
        type: "spark",
        color,
        vx,
        vy,
        size: isWillow ? random(0.9, 1.7) : random(1.4, 2.4 + sizeFactor * 0.4),
        gravity: isWillow ? 0.14 : 0.06,
        drag: isWillow ? 0.987 : 0.972,
        decay: isWillow ? 0.0035 : random(0.004, 0.009),
        life: isWillow ? 1 : random(0.85, 1)
      });
      if (Math.random() < 0.18) { p.trail = true; p.trailLen = 4; }
      this.particles.push(p);
    }
  }

  // 从最近一次爆炸位置开始，漂向 20 的某个目标点
  spawnFormParticle(targets) {
    if (!targets.length || !this.burstHistory.length) return;
    const t = targets[Math.floor(Math.random() * targets.length)];
    const origin = this.burstHistory[Math.floor(Math.random() * this.burstHistory.length)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.particles.push(new Particle(origin.x, origin.y, {
      type: "drift",
      target: t,
      color,
      driftSpeed: random(0.018, 0.032),
      size: random(1.6, 2.5)
    }));
  }

  async play(audio) {
    this.resize();
    window.addEventListener("resize", () => this.resize());

    const cfg = birthdayConfig.timing;
    await wait(cfg.fireworksQuietDelay);
    if (audio) audio.setMood("firework");

    const totalDuration = cfg.fireworksDuration;
    const tBuild = totalDuration * cfg.fireworksBuildFraction;
    const tFinale = totalDuration * cfg.fireworksFinaleFraction;
    const formThreshold = totalDuration * 0.92;
    const startTime = performance.now();
    const targets = this.getTargets();
    // 20 的目标点：按屏幕大小裁剪到合理数量，移动端少一些
    const targetMax = Math.min(180, Math.max(90, Math.floor(this.width * 0.45)));
    const finalTarget = targets.slice(0, targetMax);

    let lastRocket = 0;
    let formingStarted = false;
    let formingComplete = false;
    let holdStart = 0;
    let nextBurstType = 0;
    let formingParticleCount = 0;
    let lastFormSpawn = 0;
    let formSpawnRate = 22;

    return new Promise((resolve) => {
      const loop = (now) => {
        const elapsed = now - startTime;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.globalCompositeOperation = "screen";

        // ===== 火箭节奏（按阶段）=====
        let rocketInterval;
        if (elapsed < tBuild) {
          rocketInterval = random(800, 1400);
        } else if (elapsed < tFinale) {
          const tIn = (elapsed - tBuild) / (tFinale - tBuild);
          rocketInterval = 420 - tIn * 200; // 220→420ms 渐密
        } else if (elapsed < formThreshold) {
          rocketInterval = random(180, 280); // finale 段最密
        } else {
          // 形成 20 阶段：放慢，让上一阶段的余光有空间飘
          rocketInterval = 380;
        }
        if (now - lastRocket > rocketInterval) {
          this.spawnRocket();
          lastRocket = now;
        }

        // ===== 形成 20 =====
        if (!formingStarted && elapsed > formThreshold) {
          formingStarted = true;
        }
        if (formingStarted && !formingComplete) {
          if (now - lastFormSpawn > formSpawnRate && formingParticleCount < finalTarget.length * 1.15) {
            for (let i = 0; i < 3; i++) {
              this.spawnFormParticle(finalTarget);
              formingParticleCount++;
            }
            lastFormSpawn = now;
            formSpawnRate = Math.max(5, formSpawnRate * 0.993);
          }
          if (formingParticleCount >= finalTarget.length) {
            formingComplete = true;
            holdStart = now;
          }
        }

        // ===== 单粒子更新 =====
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          // drift 进入 rise 阶段的时间点
          if (p.type === "drift" && p.phase === "hold" && formingComplete) {
            const inHold = now - holdStart;
            if (inHold > cfg.number20HoldDuration) {
              p.phase = "rise";
              p.vy = random(-2.2, -0.9);
              p.vx = random(-0.4, 0.4);
            }
          }
          const alive = p.update();
          p.draw(this.ctx);
          if (p.type === "rocket" && !alive && p.exploded) {
            if (audio && Math.random() > 0.4) audio.boom();
            const burstType = BURST_TYPES[nextBurstType % BURST_TYPES.length];
            nextBurstType++;
            let sizeFactor;
            if (elapsed < tBuild) sizeFactor = random(0.45, 0.7);
            else if (elapsed < tFinale) sizeFactor = random(0.7, 1.3);
            else sizeFactor = random(1.1, 1.7);
            this.explode(p.x, p.y, burstType, sizeFactor);
            this.burstHistory.unshift({ x: p.x, y: p.y });
            if (this.burstHistory.length > 28) this.burstHistory.pop();
          }
          if (!alive) this.particles.splice(i, 1);
        }

        // ===== 闪光 =====
        for (let i = this.flashes.length - 1; i >= 0; i--) {
          const f = this.flashes[i];
          const alive = f.update();
          f.draw(this.ctx);
          if (!alive) this.flashes.splice(i, 1);
        }

        this.ctx.globalCompositeOperation = "source-over";

        // ===== 总时长 =====
        const totalTime = totalDuration + cfg.number20HoldDuration + cfg.number20DriftDuration + cfg.postFireworksQuiet;
        if (elapsed > totalTime) {
          cancelAnimationFrame(this.raf);
          this.ctx.clearRect(0, 0, this.width, this.height);
          resolve();
          return;
        }

        // 慢慢把画布调暗，让 20 散开后回到安静的夜空
        const fadeStart = totalDuration + cfg.number20HoldDuration + cfg.number20DriftDuration * 0.4;
        if (elapsed > fadeStart) {
          const fade = clamp((elapsed - fadeStart) / (totalTime - fadeStart), 0, 0.9);
          this.ctx.fillStyle = `rgba(2, 2, 8, ${fade})`;
          this.ctx.fillRect(0, 0, this.width, this.height);
        }

        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    });
  }
}
