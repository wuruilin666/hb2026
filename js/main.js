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

  // 对白框里的猫咪头像复用 #cat 本体（index.html 里用 <use> + 头部视框裁好），
  // 这样全站永远只有同一个角色，改猫不用改两处。

  photos.init();

  // 蛋糕离场动画会用到的两个变量：给一个安全默认值，
  // 这样即使流程有变动，离场动画也不会从错误的位置开始。
  cakeWrap.style.setProperty("--cake-forward-up", "0px");
  cakeWrap.style.setProperty("--cake-final-scale", "1");
  cakeWrap.style.setProperty("--cake-dismiss-drop", `${cfg.cakeDismissDropVh}vh`);

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

    // 蜡烛熄灭 → 蛋糕短暂停留 → 自然淡出退去 → 短暂黑暗 → 烟花
    // 注意：蛋糕的离场只发生在吹蜡烛之后，前面的捧蛋糕/插蜡烛/递近保持原状。
    await wait(cfg.cakeDismissDelay);
    cakeWrap.classList.add("cake-dismiss");
    await wait(cfg.cakeDismissDuration);
    // 结束后彻底从视觉层移除，避免悬浮在烟花或结尾文字之上
    cakeWrap.classList.add("cake-gone");

    if (audio) audio.boom();
    await wait(cfg.postCakeDarkness);

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
