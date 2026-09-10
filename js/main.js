import { birthdayConfig } from "./config.js";
import { wait, random, randomInt } from "./utils.js";
import { AudioManager } from "./audio.js";
import { photos } from "./photos.js";
import { Stars } from "./stars.js";
import { Camera } from "./camera.js";
import { Cat } from "./cat.js";
import { Candles } from "./candles.js";
import { MicBlow } from "./mic.js";
import { Fireworks } from "./fireworks.js";
import { Ending } from "./ending.js";

const cfg = birthdayConfig.timing;

// Build a fixed starry night-sky background that stays behind everything
function buildBackgroundStars() {
  const container = document.getElementById("bg-stars");
  if (!container) return;
  container.innerHTML = "";
  const count = 140;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "bg-star";
    const size = random(1, 2.6);
    s.style.width = `${size}px`;
    s.style.height = `${size}px`;
    s.style.left = `${random(0, 100)}%`;
    // Cluster most stars in the upper sky area, a few lower for depth
    const r = Math.random();
    if (r < 0.75) {
      s.style.top = `${random(2, 65)}%`;
    } else if (r < 0.95) {
      s.style.top = `${random(65, 88)}%`;
    } else {
      s.style.top = `${random(88, 100)}%`;
    }
    s.style.animationDelay = `${random(0, 3.5)}s`;
    s.style.animationDuration = `${random(2.5, 5)}s`;
    container.appendChild(s);
  }
}

async function run() {
  buildBackgroundStars();

  const audio = new AudioManager();
  const viewport = document.getElementById("viewport");
  const world = document.getElementById("world");
  const catWrap = document.getElementById("cat-wrap");
  const cakeWrap = document.getElementById("cake-wrap");
  const heldCandle = document.getElementById("held-candle");
  const startBtn = document.getElementById("start-btn");
  const intro = document.getElementById("intro");
  const wishText = document.getElementById("wish-text");
  const dialogCard = document.getElementById("dialog-card");
  const dialogLine1 = document.getElementById("dialog-line1");
  const dialogLine2 = document.getElementById("dialog-line2");
  const micHint = document.getElementById("mic-hint");
  const ending = document.getElementById("ending");
  const canvas = document.getElementById("fireworks");
  const catScene = document.getElementById("cat-scene");

  // Replace dialog avatar with a small head-only cat so it always renders
  const avatar = document.querySelector(".dialog-avatar");
  if (avatar) {
    avatar.innerHTML = `
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="avEye" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stop-color="#d8e89a" />
            <stop offset="60%" stop-color="#8aa64a" />
            <stop offset="100%" stop-color="#3d5a20" />
          </radialGradient>
        </defs>
        <!-- ears -->
        <path d="M30,55 L12,5 L78,40 Z" fill="#1a1a1a" />
        <path d="M170,55 L188,5 L122,40 Z" fill="#1a1a1a" />
        <path d="M40,42 L30,18 L65,42 Z" fill="#f4b6a0" />
        <path d="M160,42 L170,18 L135,42 Z" fill="#f4b6a0" />
        <!-- white fur tufts -->
        <path d="M40,52 C 46,62 58,64 70,55 C 60,50 50,50 40,52 Z" fill="#f8f7f2" />
        <path d="M160,52 C 154,62 142,64 130,55 C 140,50 150,50 160,52 Z" fill="#f8f7f2" />
        <!-- head -->
        <ellipse cx="100" cy="110" rx="82" ry="72" fill="#f8f7f2" />
        <!-- asymmetric cap -->
        <path d="M18,82 C 12,38 50,22 100,22 C 110,22 118,30 118,46 C 118,60 108,68 90,72 C 60,76 30,80 22,86 C 18,86 18,84 18,82 Z" fill="#1a1a1a" />
        <path d="M182,82 C 188,42 150,28 110,30 C 100,30 95,40 95,50 C 95,60 102,68 118,72 C 145,76 168,80 178,86 C 182,86 182,84 182,82 Z" fill="#1a1a1a" />
        <!-- left eye patch (large) -->
        <path d="M25,100 C 38,80 65,72 90,86 C 100,98 96,118 78,128 C 50,132 22,122 22,108 C 22,104 23,102 25,100 Z" fill="#1a1a1a" opacity="0.97" />
        <!-- right eye patch (small) -->
        <path d="M150,98 C 135,86 115,90 108,104 C 106,118 122,128 140,124 C 160,120 168,108 164,100 C 162,98 155,98 150,98 Z" fill="#1a1a1a" opacity="0.95" />
        <!-- eyes -->
        <circle cx="55" cy="106" r="18" fill="url(#avEye)" />
        <circle cx="55" cy="106" r="11" fill="#0a0a0a" />
        <circle cx="60" cy="100" r="4" fill="#fff" />
        <circle cx="145" cy="106" r="18" fill="url(#avEye)" />
        <circle cx="145" cy="106" r="11" fill="#0a0a0a" />
        <circle cx="150" cy="100" r="4" fill="#fff" />
        <!-- nose, mouth, collar, bell -->
        <ellipse cx="100" cy="135" rx="6" ry="4" fill="#f4a4a4" />
        <path d="M95,142 Q100,148 105,142" stroke="#aaa" stroke-width="1.6" fill="none" stroke-linecap="round" />
        <path d="M70,150 Q100,170 130,150 Q100,178 70,150 Z" fill="#c0392b" />
        <circle cx="100" cy="165" r="6" fill="#cfcfcf" stroke="#888" stroke-width="0.8" />
      </svg>
    `;
  }

  photos.init();

  // INTRO
  await wait(300);

  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    startBtn.classList.add("hidden");
    intro.style.opacity = "0";
    setTimeout(() => intro.remove(), 700);

    // 不阻塞剧情：音乐在后台加载，失败会自动回退，不影响后续动画
    audio.start().catch(() => {});

    // STARS
    const stars = new Stars(document.getElementById("stars"));
    await stars.appear();

    // Gate the camera descent: only proceed after all 5 memories have been opened AND closed
    // For debugging/preview, append ?skip=1 to the URL to skip the gate
    const skipGate = new URLSearchParams(location.search).has("skip");
    if (!skipGate) {
      while (!photos.areAllViewed()) {
        await wait(300);
      }
    } else {
      // Auto-open all memories for visual testing
      for (const m of birthdayConfig.memories) {
        photos.openedStars.add(m.star);
        photos.viewedStars.add(m.star);
      }
    }
    if (photos.isOpen) photos.close();
    stars.dim();

    // CAMERA DOWN
    audio.setMood("cat");
    const camera = new Camera(world, viewport, catWrap, cakeWrap);
    await camera.down();

    // CAT + CANDLES
    catScene.classList.add("show");
    const cat = new Cat(catWrap, heldCandle);
    const candles = new Candles(wishText);
    cat.holdCake();
    await wait(cfg.catIntroPause);

    audio.setMood("candle");
    await candles.sequence(cat, audio);

    // CAKE FORWARD
    audio.setMood("blow");
    computeCakeForwardScale();
    await camera.cakeForward();

    // BLOW DIALOG
    dialogLine1.textContent = birthdayConfig.blowDialog[0];
    dialogLine2.textContent = birthdayConfig.blowDialog[1];
    dialogCard.setAttribute("aria-hidden", "false");
    dialogCard.classList.add("show");
    micHint.classList.add("show");

    const mic = new MicBlow(audio);
    const result = await mic.listen(cfg.blowFallbackMs);
    micHint.classList.remove("show");
    dialogCard.classList.remove("show");
    dialogCard.setAttribute("aria-hidden", "true");

    await wait(cfg.blowExtinguishDelay);
    candles.extinguishAll();
    if (audio) audio.boom();
    await wait(1200);

    // FIREWORKS
    const fireworks = new Fireworks(canvas);
    await fireworks.play(audio);

    // ENDING
    audio.setMood("ending");
    const endingPlayer = new Ending(ending, viewport);
    await endingPlayer.play();

    audio.stop();
  }, { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}

// Compute a scale + vertical shift that brings the cake close but keeps it
// (and the largest candle) fully inside the viewport, centered above the
// dialog card that will appear at the bottom.
function computeCakeForwardScale() {
  const cake = document.getElementById("cake-wrap");
  if (!cake) return;
  const rect = cake.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sai-bottom")) || 0;

  // Scaled cake must fit in the area above the dialog card
  const margin = 16;
  const dialogReserve = 0.36; // ~ 36vh reserved for the dialog card at the bottom
  const topReserve = 0.08;     // leave 8vh headroom so the tallest candle flame isn't clipped
  const usableH = vh * (1 - dialogReserve - topReserve);
  const usableW = vw - margin * 2;
  const sx = usableW / rect.width;
  const sy = usableH / rect.height;
  const scale = Math.max(1.2, Math.min(2.4, Math.min(sx, sy)));
  cake.style.setProperty("--cake-final-scale", scale.toFixed(3));

  // Vertical shift: place the scaled cake so its center is in the
  // [topReserve .. 1 - dialogReserve] midband of the viewport.
  const centerY = rect.top + rect.height / 2;
  const targetCenterY = vh * (topReserve + (1 - dialogReserve - topReserve) * 0.5);
  const upPx = targetCenterY - centerY; // negative if we need to go up
  cake.style.setProperty("--cake-forward-up", `${-upPx}px`);
}
