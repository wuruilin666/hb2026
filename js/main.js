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

  // Replace dialog avatar with a small head-only cat so it always renders
  const avatar = document.querySelector(".dialog-avatar");
  if (avatar) {
    avatar.innerHTML = `
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="avEye" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#c5e08d" />
            <stop offset="75%" stop-color="#6e8f3e" />
            <stop offset="100%" stop-color="#3d5a20" />
          </radialGradient>
        </defs>
        <path d="M40,60 L20,10 L75,45 Z" fill="#1a1a1a" />
        <path d="M160,60 L180,10 L125,45 Z" fill="#1a1a1a" />
        <ellipse cx="100" cy="110" rx="85" ry="75" fill="#f8f7f2" />
        <path d="M-5,75 Q0,20 100,18 Q200,20 205,75 Q170,45 100,45 Q30,45 -5,75 Z" fill="#1a1a1a" />
        <path d="M45,95 Q70,75 95,95 Q90,125 60,130 Q30,125 45,95 Z" fill="#1a1a1a" opacity="0.95" />
        <path d="M155,95 Q130,75 105,95 Q110,125 140,130 Q170,125 155,95 Z" fill="#1a1a1a" opacity="0.92" />
        <circle cx="68" cy="108" r="18" fill="url(#avEye)" />
        <circle cx="68" cy="108" r="10" fill="#111" />
        <circle cx="132" cy="108" r="18" fill="url(#avEye)" />
        <circle cx="132" cy="108" r="10" fill="#111" />
        <ellipse cx="100" cy="138" rx="8" ry="5" fill="#f4a4a4" />
        <path d="M35,135 L10,125 M35,142 L5,145 M35,149 L12,160 M165,135 L190,125 M165,142 L195,145 M165,149 L188,160" stroke="#ddd" stroke-width="2" stroke-linecap="round" />
        <path d="M55,155 Q100,175 145,155 Q100,185 55,155" fill="#c0392b" />
        <circle cx="100" cy="168" r="7" fill="#d0d0d0" />
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

    await audio.start();

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
    const cat = new Cat(catWrap, heldCandle);
    const candles = new Candles(wishText);
    cat.holdCake();
    await wait(cfg.catIntroPause);

    audio.setMood("candle");
    await candles.sequence(cat, audio);

    // CAKE FORWARD
    audio.setMood("blow");
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
