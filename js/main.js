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

// 音频启动的提示文案（非常轻量的一行字，不是弹窗）
const AUDIO_PREPARING = "正在准备音乐…";
const AUDIO_RETRY_HINT = "音乐没能启动，点一下屏幕再试一次";
const AUDIO_GIVEUP_HINT = "音乐没能启动，画面会继续，只是没有背景音乐";
const MAX_AUDIO_RETRIES = 3;

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
  // 开发调试：URL 带 ?cueedit=1 时只启动 Episode 33 cue 编辑器，不跑正式剧情。
  // 用动态 import —— 正式页面根本不会加载 js/cue-editor.js，没有任何额外开销。
  if (new URLSearchParams(location.search).has("cueedit")) {
    import("./cue-editor.js")
      .then((m) => m.startCueEditor())
      .catch((err) => console.error("[cue] 启动失败", err));
    return;
  }

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

  /* ------------------------------------------------------------------
     音频启动状态提示
     ------------------------------------------------------------------
     一行很小的说明文字，位置就在开始按钮原来的位置下方。元素由这里创建
     （index.html 不动），只在「启动慢到用户会察觉 / 启动失败」时出现；
     音乐正常启动的情况下从头到尾都不会显示。
     它绝不遮挡任何东西（pointer-events: none），也不是弹窗。
  ------------------------------------------------------------------ */
  let audioStatusEl = null;
  let audioStatusTimer = 0;

  function setAudioStatus(text, keepMs = 0) {
    if (!audioStatusEl) {
      audioStatusEl = document.createElement("div");
      audioStatusEl.className = "audio-status";
      audioStatusEl.setAttribute("role", "status");
      audioStatusEl.setAttribute("aria-live", "polite");
      viewport.appendChild(audioStatusEl);
    }
    clearTimeout(audioStatusTimer);
    audioStatusTimer = 0;
    audioStatusEl.textContent = text || "";
    audioStatusEl.classList.toggle("show", !!text);
    if (text && keepMs > 0) {
      // 提示自己会淡出：避免一行错误文字一直挂在画面上直到结尾
      audioStatusTimer = setTimeout(() => {
        audioStatusEl.textContent = "";
        audioStatusEl.classList.remove("show");
      }, keepMs);
    }
  }

  let audioRetries = 0;

  /**
   * 音频完全没起来时的重试。
   *
   * 浏览器只允许在「一次真实的用户手势」里建立音频，所以重试必须挂在点击上。
   * 重试成功后音乐直接从当前阶段接着走 —— setMood / getMusicTime 读的都是实时状态，
   * 不需要重建剧情，也不会让音乐从头开始、更不会重置音乐时间轴。
   */
  function armAudioRetry() {
    if (audioRetries >= MAX_AUDIO_RETRIES) {
      setAudioStatus(AUDIO_GIVEUP_HINT, 6000);
      return;
    }
    setAudioStatus(AUDIO_RETRY_HINT, 6000);
    // 必须等这一次 click 的事件派发彻底结束再挂监听：DOM 规范里在派发过程中
    // 新加到祖先节点上的监听器，会被同一个事件立刻触发 —— 那样这次点击就会
    // 当场把重试名额吃掉（而且是在音频刚判定失败、还没准备好的时候）。
    setTimeout(() => {
      document.addEventListener("click", retryAudio, { once: true, capture: true });
    }, 0);
  }

  async function retryAudio() {
    audioRetries += 1;
    setAudioStatus(AUDIO_PREPARING);
    const r = await audio.start();
    if (r.ok) {
      setAudioStatus("");
      console.log(`[audio] 重试成功：mode=${r.mode}`);
      // start() 内部会先按 "stars" 档设一次音量；这里拉回剧情真正所在的阶段
      audio.setMood(audio.currentMood);
      return;
    }
    console.warn(`[audio] 重试仍未成功（${r.reason}）`);
    armAudioRetry();
  }

  // INTRO
  await wait(300);

  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    startBtn.classList.add("hidden");
    intro.style.opacity = "0";
    setTimeout(() => intro.remove(), 700);

    // ---- 1) 先把音频启动这一步做完，拿到「明确的结果」再进星星 ----
    //
    // audio.start() **永远不会 reject**：它返回 { ok, mode, reason }。
    // 整段还有硬上限（config.timing.audioStartTimeout，默认 3 秒）——
    // 某些 WebView 里 play() / AudioContext.resume() 的 Promise 既不 resolve
    // 也不 reject，没有上限的话用户看到的就是「点完开始，页面像卡死」。
    //
    // 以前这里是 `audio.start().catch(() => {})`：既不 await、又把错误全部吞掉，
    // 于是「音乐没起来」这件事没有任何人知道，剧情照样往下跑。
    // 只有慢到用户会察觉（>250ms）才显示「正在准备音乐…」，正常情况不会闪出一行字。
    const preparingTimer = setTimeout(() => setAudioStatus(AUDIO_PREPARING), 250);
    const audioResult = await audio.start();
    clearTimeout(preparingTimer);

    if (audioResult.ok) {
      setAudioStatus("");
      console.log(`[audio] 音乐已启动：mode=${audioResult.mode}`);
    } else {
      console.warn(`[audio] 音乐未能启动（${audioResult.reason}）：进入无音乐降级，剧情继续`);
      armAudioRetry();
    }

    // ---- 2) STARS ----
    // 把 audio 和启动结果一起交给 Stars：
    //   · mode === "file" → 15 颗普通星星按原节奏出现，5 颗特殊星星由 bgm 的
    //     真实鼓点（<audio>.currentTime）驱动亮起来
    //   · 其它情况 → 明确走「无音乐降级」，20 颗星星走同一条一颗一颗出现的序列
    // 音乐只控制「特殊星星什么时候出现」，绝不会自动打开照片 ——
    // 照片只能是用户点击特殊星星后由 photos.openForStar() 打开。
    const stars = new Stars(document.getElementById("stars"));
    await stars.appear(audio, audioResult);

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
