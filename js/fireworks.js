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

// 组成 "20" 的粒子：偏暖白，数字才看得清
const FORM_COLORS = [
  "#ffffff", "#ffffff", "#ffffff",
  "#fff0c8", "#ffcf6b", "#ffcf6b", "#ffd1a4",
  "#ff8a4d", "#ff6b9b", "#9b6cff", "#5fd6c2"
];

const BURST_TYPES = ["peony", "chrysanthemum", "willow", "ring", "crown"];

// 烟花状态机。FORMING_20 之后不再产生随机烟花，20 是唯一的视觉中心。
const STATE = {
  BUILD: "FIREWORK_BUILD",
  PEAK: "FIREWORK_PEAK",
  FORMING: "FORMING_20",
  HOLD: "HOLD_20",
  DRIFT: "DRIFT_20",
  FINISH: "FINISH"
};

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
    // 每帧由主循环写入：这一帧相当于多少个 16.7ms 的标准帧。
    // 所有按"每帧"衰减的量都乘上它，120Hz / 掉帧时才不会快一倍或慢一半。
    this.step = 1;

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
      this.rise = 0;
      // 升到指定高度就炸。以前靠 vy 衰减到 -1 才炸要 3.6 秒，快的那几发
      // 早冲出屏幕顶了 —— 炸在上方看不见，白放。现在爆炸点必定在画面里。
      this.maxRise = opts.maxRise ?? 600;
      this.exploded = false;
    } else if (this.type === "drift") {
      // 烟花余光飞向 "20" 上的一个目标点，停住，最后再散开成星光
      this.startX = x;
      this.startY = y;
      this.t = 0;
      this.driftSpeed = opts.driftSpeed ?? 0.028;
      this.phase = "travel";
      this.holdTime = 0;
      this.riseAt = opts.riseAt ?? 0;
      this.center = opts.center || null; // 数字中心，用来做整体"呼吸"
      this.breath = 0;
      this.twinklePhase = random(0, Math.PI * 2);
      this.life = 1;
      this.decay = 0;
      this.gravity = 0;
      this.drag = 1;
    }
  }

  update() {
    const k = this.step;
    if (this.type === "drift") {
      if (this.phase === "travel") {
        this.t += this.driftSpeed * k;
        if (this.t >= 1) { this.t = 1; this.phase = "hold"; }
        const eased = 1 - Math.pow(1 - this.t, 3);
        this.x = this.startX + (this.target.x - this.startX) * eased;
        this.y = this.startY + (this.target.y - this.startY) * eased;
        return true;
      }
      if (this.phase === "hold") {
        this.holdTime += k;
        const bx = this.center ? this.center.x : this.target.x;
        const by = this.center ? this.center.y : this.target.y;
        const s = 1 + this.breath;
        this.x = bx + (this.target.x - bx) * s + Math.sin((this.holdTime + this.twinklePhase) * 0.15) * 0.4;
        this.y = by + (this.target.y - by) * s + Math.cos((this.holdTime + this.twinklePhase) * 0.18) * 0.4;
        // 闪烁但不熄灭。下限给到 0.9：低于这个值光晕不再互相叠合，
        // 数字会碎成一粒粒的"沙点"，看着就不清晰了。
        this.life = 0.95 + Math.sin((this.holdTime + this.twinklePhase) * 0.22) * 0.05;
        return true;
      }
      if (this.phase === "rise") {
        this.y += this.vy * k;
        this.x += this.vx * k;
        this.vx *= Math.pow(0.985, k);
        this.vy *= Math.pow(0.985, k);
        this.vy -= 0.015 * k; // 持续向上加速（轻微）
        this.life -= this.decay * k;
        return this.life > 0;
      }
      return true;
    }

    if (this.type === "rocket") {
      this.x += this.vx * k;
      this.y += this.vy * k;
      this.rise += -this.vy * k;
      this.vy *= Math.pow(0.99, k);
      if (this.rise >= this.maxRise || this.vy > -1.0) {
        this.exploded = true;
        this.life = 0;
        return false;
      }
      return true;
    }

    // spark
    this.x += this.vx * k;
    this.y += this.vy * k;
    if (this.gravity) this.vy += this.gravity * k;
    this.vx *= Math.pow(this.drag, k);
    this.vy *= Math.pow(this.drag, k);
    this.life -= this.decay * k;
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
    this.step = 1;
  }
  update() {
    this.life -= 0.06 * this.step;
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
    this.raf = null;
    this.width = 0;
    this.height = 0;
    this.glyphCenter = { x: 0, y: 0 };
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

  /**
   * 目标点分四步算，和视口大小彻底解耦，任何机型都是完整、居中、不裁切的 "20"：
   *   1) 在【固定分辨率】的离屏画布上把 "20" 栅格化（字号写死 400），
   *      跟屏幕尺寸无关 —— 不会再因为字号算小了而采样不到像素。
   *   2) 把 ink 像素归一化到字形自身的包围盒（0..1），并记下真实宽高比。
   *   3) 按屏幕可用范围【等比】缩放到 86% 宽 / 58% 高以内，居中到 (w/2, 0.45h)。
   *      等比 → 永不变形；取 min → 永不超出；居中 → 永不偏。
   *   4) 洗牌后均匀取样 —— 左右两个数字、笔画内部和边缘都被均匀覆盖，
   *      而不是以前那样 slice 出扫描顺序最靠前的几行像素（只能拿到数字顶部）。
   */
  getTargets() {
    if (!this.width || !this.height) this.resize();

    // ---- 1) 固定分辨率栅格化 ----
    const R = 400;
    const font = (s) => `bold ${s}px Georgia, "Times New Roman", serif`;
    const bmp = document.createElement("canvas");
    const probe = bmp.getContext("2d");
    probe.font = font(R);
    const m = probe.measureText("20");
    const asc = m.actualBoundingBoxAscent || R * 0.74;
    const desc = m.actualBoundingBoxDescent || R * 0.02;
    const pad = 6;
    const w = Math.ceil(m.width) + pad * 2;
    const h = Math.ceil(asc + desc) + pad * 2;

    bmp.width = w;
    bmp.height = h;
    const cx = bmp.getContext("2d");
    cx.font = font(R);
    cx.fillStyle = "#fff";
    cx.textAlign = "start";
    cx.textBaseline = "alphabetic";
    cx.fillText("20", pad, pad + asc);

    const data = cx.getImageData(0, 0, w, h).data;
    const pts = [];
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (data[(y * w + x) * 4 + 3] > 120) pts.push({ x, y });
      }
    }
    if (!pts.length) return [];

    // ---- 2) 归一化到字形包围盒 ----
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const gw = Math.max(1, maxX - minX);
    const gh = Math.max(1, maxY - minY);

    // ---- 3) 等比缩放到屏幕可用范围，居中 ----
    const scale = Math.min((this.width * 0.86) / gw, (this.height * 0.58) / gh);
    const dispW = gw * scale;
    const dispH = gh * scale;
    const originX = this.width / 2 - dispW / 2;
    const originY = this.height * 0.45 - dispH / 2;
    this.glyphCenter = { x: this.width / 2, y: this.height * 0.45 };

    // ---- 4) 均匀取样 ----
    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pts[i]; pts[i] = pts[j]; pts[j] = tmp;
    }
    // 目标点数按【显示后的实际面积】算，屏幕上粒子间距始终约 6px：
    // 大屏铺得开、小屏够密，不会出现"数字只剩几个星点"的情况。
    const count = clamp(Math.round((pts.length * scale * scale) / 9), 700, 3600);
    const picked = pts.slice(0, Math.min(count, pts.length));

    return picked.map((p) => ({
      x: originX + (p.x - minX) * scale,
      y: originY + (p.y - minY) * scale
    }));
  }

  spawnRocket() {
    const x = random(this.width * 0.08, this.width * 0.92);
    // 爆炸点落在画面上部：升幅 42%~72% 屏高，任何机型都看得见烟花
    const maxRise = random(this.height * 0.42, this.height * 0.72);
    this.particles.push(new Particle(x, this.height, { type: "rocket", maxRise }));
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

  // 一颗余光飞向 "20" 上的指定目标点。
  // 起点是目标点周围的随机方位 —— 不依赖任何历史爆炸位置，任何时候都成立。
  spawnFormParticle(target, center, cfg) {
    const ang = Math.random() * Math.PI * 2;
    const rad = random(70, 260);
    this.particles.push(new Particle(
      target.x + Math.cos(ang) * rad,
      target.y + Math.sin(ang) * rad,
      {
        type: "drift",
        target,
        center,
        color: FORM_COLORS[Math.floor(Math.random() * FORM_COLORS.length)],
        driftSpeed: random(0.020, 0.034),
        size: random(1.5, 2.3),
        riseAt: random(0, cfg.number20DriftDuration * 0.6)
      }
    ));
  }

  async play(audio) {
    this.resize();
    window.addEventListener("resize", () => this.resize());

    const cfg = birthdayConfig.timing;
    await wait(cfg.fireworksQuietDelay);
    if (audio) audio.setMood("firework");

    const base = cfg.fireworksDuration;
    const tBuild = base * cfg.fireworksBuildFraction;
    const tForm = base * cfg.fireworksFormFraction;
    const tGather = base * cfg.fireworksGatherFraction;
    const tFormEnd = base * cfg.fireworksFormEndFraction;

    const targets = this.getTargets();
    const center = this.glyphCenter;

    let state = STATE.BUILD;
    let spawned = 0;
    let holdAt = 0;
    let driftAt = 0;
    let finishAt = 0;
    let nextBurstType = 0;
    let lastRocket = 0;
    let lastFrame = 0;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const loop = (now) => {
        const elapsed = now - startTime;
        // 这一帧顶多少个标准帧（16.7ms）。上限 5，长时间卡顿宁可慢动作也不要瞬移。
        const step = lastFrame ? Math.min(5, Math.max(0.2, (now - lastFrame) / 16.7)) : 1;
        lastFrame = now;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.globalCompositeOperation = "screen";

        // ===== 状态切换 =====
        if (state === STATE.BUILD && elapsed >= tBuild) state = STATE.PEAK;
        if (state === STATE.PEAK && elapsed >= tForm) state = STATE.FORMING;
        if (state === STATE.HOLD && now - holdAt >= cfg.number20HoldDuration) {
          state = STATE.DRIFT;
          driftAt = now;
        } else if (state === STATE.DRIFT && now - driftAt >= cfg.number20DriftDuration) {
          state = STATE.FINISH;
          finishAt = now;
        } else if (state === STATE.FINISH && now - finishAt >= cfg.postFireworksQuiet) {
          cancelAnimationFrame(this.raf);
          this.ctx.clearRect(0, 0, this.width, this.height);
          resolve();
          return;
        }

        // ===== 火箭：进入 FORMING_20 后只零星放几发，gather 之后完全停 =====
        let rocketInterval = 0;
        if (state === STATE.BUILD) {
          rocketInterval = random(800, 1400);
        } else if (state === STATE.PEAK) {
          const t = clamp((elapsed - tBuild) / Math.max(1, tForm - tBuild), 0, 1);
          rocketInterval = 360 - t * 180; // 360 → 180ms，渐密（庆典高潮感）
        } else if (state === STATE.FORMING && elapsed < tGather) {
          rocketInterval = random(560, 900); // 数量明显减少
        }
        if (rocketInterval && now - lastRocket > rocketInterval) {
          this.spawnRocket();
          lastRocket = now;
        }

        // ===== 聚成 "20"：把目标点一个一个发完，到 tFormEnd 必定 100% 覆盖 =====
        if (state === STATE.FORMING) {
          const remain = targets.length - spawned;
          if (remain > 0) {
            // 剩余"标准帧"数（按本帧实际时长折算），不管 60Hz 还是 120Hz，
            // 生成节奏都跟真实时间对齐；且一直发到目标点全部发完才进 HOLD，
            // 所以无论如何 "20" 都是 100% 覆盖的。
            const framesLeft = Math.max(1, (tFormEnd - elapsed) / (16.7 * step));
            const n = Math.min(remain, Math.max(1, Math.ceil(remain / framesLeft)));
            for (let i = 0; i < n; i++) {
              this.spawnFormParticle(targets[spawned], center, cfg);
              spawned++;
            }
          }
          if (spawned >= targets.length) {
            state = STATE.HOLD;
            holdAt = now;
          }
        }

        // 20 整体的轻微呼吸（幅度压小，数字边缘才不会忽大忽小地发虚）
        const breath = holdAt ? Math.sin((now - holdAt) * 0.0016) * 0.007 : 0;

        // ===== 单粒子更新 =====
        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.step = step; // 关键：把本帧时长喂给粒子，120Hz 才不会是两倍速
          if (p.type === "drift") {
            p.breath = breath;
            // 散开阶段：错峰起飞，20 由点及面地化开，而不是整块消失
            if (p.phase === "hold" && driftAt && now - driftAt >= p.riseAt) {
              p.phase = "rise";
              p.vy = random(-2.4, -0.8);
              p.vx = random(-0.55, 0.55);
              p.decay = random(0.007, 0.012);
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
            else if (elapsed < tForm) sizeFactor = random(0.85, 1.5);
            else sizeFactor = random(1.1, 1.7);
            this.explode(p.x, p.y, burstType, sizeFactor);
          }
          if (!alive) this.particles.splice(i, 1);
        }

        // ===== 闪光 =====
        for (let i = this.flashes.length - 1; i >= 0; i--) {
          const f = this.flashes[i];
          f.step = step;
          const alive = f.update();
          f.draw(this.ctx);
          if (!alive) this.flashes.splice(i, 1);
        }

        this.ctx.globalCompositeOperation = "source-over";

        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    });
  }
}
