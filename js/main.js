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

// Compute a scale + vertical shift that puts the cake at the VISUAL CENTER of the
// viewport. During the blow-candles stage the cake is the absolute focal point of
// the composition, so its center should sit at ~50% viewport height. The dialog
// card is only a UI overlay pinned to the very bottom — it no longer dictates where
// the cake goes. We only keep two minimal safety constraints so the tallest candle
// flame is never clipped at the top and the cake base never collides with the
// bottom UI. No "reserve 36vh for the dialog" logic anymore.
function computeCakeForwardScale() {
  const cake = document.getElementById("cake-wrap");
  if (!cake) return;
  const rect = cake.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // --- Target: cake visual center = viewport center ---
  const centerFrac = 0.50;        // 蛋糕视觉中心对齐视口 50%
  const candleTopSafety = 0.06;   // 最高蜡烛火焰距顶部至少保留 6vh
  const bottomMargin = 0.08;      // 蛋糕底盘距底部至少 8vh（对白卡是叠加层，不决定构图）

  // Geometry of the cake SVG (viewBox "-130 -70 260 160") expressed as fractions of
  // its rendered height, so the margins stay correct at any scale.
  //  - tallest candle flame reaches y≈-104, i.e. 0.2125*h above the viewBox top (-70)
  //  - cake board bottom reaches y=100, i.e. 0.5625*h below the viewBox center (10)
  const flameOverhang = 0.2125;
  const boardBelowCenter = 0.5625;

  const margin = 16;
  // Width: fill the available width (16px gutters), never overflow sideways.
  const sx = (vw - margin * 2) / rect.width;
  // Height: center the cake, but cap its half-height so the top candle keeps
  // candleTopSafety and the base keeps bottomMargin. The smaller of the two bands
  // wins — that is the only thing allowed to shift the cake off dead-center.
  const maxHalfFrac = Math.min(
    centerFrac - candleTopSafety,          // 顶部：最高蜡烛完整
    1 - centerFrac - bottomMargin          // 底部：蛋糕底盘不入对白卡
  );
  const sy = (vh * maxHalfFrac * 2) / rect.height;

  let scale = Math.min(sx, sy);
  scale = Math.max(1.2, Math.min(2.4, scale));
  cake.style.setProperty("--cake-final-scale", scale.toFixed(3));

  // Vertical shift. transform-origin is center-bottom, so after scaling about the
  // bottom edge the cake's center lands at (rect.bottom - scaledH/2); we then move
  // it up by `upPx` so the center hits exactly targetCenterY.
  const scaledH = rect.height * scale;
  const targetCenterY = vh * centerFrac;
  const upPx = rect.bottom - scaledH / 2 - targetCenterY; // >0 means shift up
  cake.style.setProperty("--cake-forward-up", `${upPx.toFixed(1)}px`);
}
