import { birthdayConfig } from "./config.js";
import { wait, random, clamp } from "./utils.js";

// Japanese hanabi-inspired palette: warm gold, crimson, indigo, jade, silver, white
const COLORS = [
  "#ffcf6b",
  "#ff8a4d",
  "#ff4f6d",
  "#9b6cff",
  "#5fd6c2",
  "#ffffff",
  "#ffd1a4"
];

const BURST_TYPES = ["peony", "chrysanthemum", "willow", "ring"];

class Particle {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.type = opts.type || "spark";
    this.target = opts.target || null;
    this.color = opts.color || COLORS[Math.floor(Math.random() * COLORS.length)];
    this.size = opts.size ?? random(1.4, 3.2);
    this.vx = opts.vx ?? 0;
    this.vy = opts.vy ?? 0;
    this.life = opts.life ?? 1;
    this.decay = opts.decay ?? random(0.004, 0.012);
    this.gravity = opts.gravity ?? 0.05;
    this.drag = opts.drag ?? 0.965;
    this.trail = !!opts.trail;
    this.trailLen = opts.trailLen ?? 0;

    if (this.type === "rocket") {
      const angle = -Math.PI / 2 + random(-0.15, 0.15);
      const speed = random(8, 13);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.size = random(1.6, 2.4);
      this.exploded = false;
      this.trail = true;
      this.trailLen = 6;
      this.life = 1;
      this.decay = 0;
    } else if (this.type === "target") {
      this.startX = x;
      this.startY = y;
      this.t = 0;
      this.speed = random(0.018, 0.045);
      this.size = random(2, 3.6);
      this.decay = 0;
      this.life = 1;
      this.gravity = 0;
      this.drag = 1;
    } else if (this.type === "spark") {
      this.life = 1;
    }
  }

  update() {
    if (this.type === "target") {
      this.t += this.speed;
      if (this.t >= 1) {
        this.t = 1;
        this.life -= 0.0025;
      }
      const eased = 1 - Math.pow(1 - this.t, 3);
      this.x = this.startX + (this.target.x - this.startX) * eased;
      this.y = this.startY + (this.target.y - this.startY) * eased;
      return this.life > 0;
    }

    if (this.type === "rocket") {
      this.x += this.vx;
      this.y += this.vy;
      this.vy *= 0.99;
      if (this.vy > -1.2) {
        this.exploded = true;
        this.life = 0;
        return false;
      }
      return true;
    }

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
      ctx.moveTo(this.x - this.vx * 1.4, this.y - this.vy * 1.4);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export class Fireworks {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.particles = [];
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

  getTargets() {
    const c = document.createElement("canvas");
    c.width = this.width;
    c.height = this.height;
    const x = c.getContext("2d");
    const fontSize = Math.min(this.width * 0.5, this.height * 0.5, 360);
    x.font = `bold ${fontSize}px Georgia, serif`;
    x.fillStyle = "#fff";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText("20", this.width / 2, this.height / 2);
    const image = x.getImageData(0, 0, this.width, this.height);
    const data = image.data;
    const points = [];
    const step = Math.max(4, Math.floor(fontSize / 32));
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
    const x = random(this.width * 0.1, this.width * 0.9);
    const p = new Particle(x, this.height, { type: "rocket" });
    p.color = "#fff7d6";
    this.particles.push(p);
  }

  // Burst at (x,y) with a given type; creates rich particle patterns
  explode(x, y, type = "peony") {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const count = type === "willow" ? 70 : type === "ring" ? 48 : 55;
    for (let i = 0; i < count; i++) {
      let angle, speed;
      if (type === "ring") {
        angle = (i / count) * Math.PI * 2;
        speed = 6.5;
      } else if (type === "willow") {
        angle = -Math.PI / 2 + random(-Math.PI / 2.2, Math.PI / 2.2);
        speed = random(2, 5);
      } else if (type === "chrysanthemum") {
        angle = random(0, Math.PI * 2);
        speed = random(5, 8);
      } else {
        // peony
        angle = random(0, Math.PI * 2);
        speed = random(4, 7);
      }
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const isWillow = type === "willow";
      this.particles.push(new Particle(x, y, {
        type: "spark",
        color,
        vx,
        vy,
        size: isWillow ? random(1, 2) : random(1.6, 3),
        gravity: isWillow ? 0.14 : 0.06,
        drag: isWillow ? 0.985 : 0.97,
        decay: isWillow ? 0.004 : random(0.005, 0.011),
        life: isWillow ? 1 : random(0.8, 1),
        trail: false
      }));
    }
  }

  spawnTarget(targets) {
    if (!targets.length) return;
    const t = targets[Math.floor(Math.random() * targets.length)];
    const startX = random(0, this.width);
    const startY = random(this.height * 0.75, this.height);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.particles.push(new Particle(startX, startY, {
      type: "target",
      target: t,
      color
    }));
  }

  async play(audio) {
    this.resize();
    window.addEventListener("resize", () => this.resize());

    await wait(birthdayConfig.timing.fireworksQuietDelay);
    if (audio) audio.setMood("firework");

    const duration = birthdayConfig.timing.fireworksDuration;
    const startTime = performance.now();
    let lastRocket = 0;
    let rocketInterval = 280;
    let nextBurstType = 0;

    const targets = this.getTargets();
    let formingStarted = false;
    let formSpawnRate = 10;
    let lastFormSpawn = 0;

    return new Promise((resolve) => {
      const loop = (now) => {
        const elapsed = now - startTime;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.globalCompositeOperation = "screen";

        // Rocket phase: continuous launches for the first ~70% of duration
        if (elapsed < duration * 0.7) {
          if (now - lastRocket > rocketInterval) {
            this.spawnRocket();
            lastRocket = now;
            rocketInterval = random(160, 520);
          }
        }

        // Start forming "20" around 55% through
        if (!formingStarted && elapsed > duration * 0.55) {
          formingStarted = true;
        }

        if (formingStarted) {
          if (now - lastFormSpawn > formSpawnRate) {
            for (let i = 0; i < 4; i++) this.spawnTarget(targets);
            lastFormSpawn = now;
            formSpawnRate = Math.max(3, formSpawnRate * 0.988);
          }
        }

        // Update and draw particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          const alive = p.update();
          p.draw(this.ctx);
          if (p.type === "rocket" && !alive && p.exploded) {
            if (audio && Math.random() > 0.5) audio.boom();
            const burstType = BURST_TYPES[nextBurstType % BURST_TYPES.length];
            nextBurstType++;
            this.explode(p.x, p.y, burstType);
          }
          if (!alive) this.particles.splice(i, 1);
        }

        this.ctx.globalCompositeOperation = "source-over";

        const hold = birthdayConfig.timing.number20HoldDuration;
        const totalTime = duration + hold + 3000;
        if (elapsed > totalTime) {
          cancelAnimationFrame(this.raf);
          this.ctx.clearRect(0, 0, this.width, this.height);
          resolve();
          return;
        }

        // Fade overlay after hold
        if (elapsed > duration + hold) {
          const fade = (elapsed - (duration + hold)) / 3000;
          this.ctx.fillStyle = `rgba(2, 2, 5, ${clamp(fade, 0, 1)})`;
          this.ctx.fillRect(0, 0, this.width, this.height);
        }

        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    });
  }
}

function randomInt(min, max) {
  return Math.floor(random(min, max + 1));
}