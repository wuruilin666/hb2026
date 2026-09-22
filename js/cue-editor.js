// ============================================================================
// 开发调试专用：Episode 33「cue 编辑器」（只在 URL 带 ?cueedit=1 时启用）
// ----------------------------------------------------------------------------
// 用途：把 assets/bgm.mp3 前奏里那几声明显的「dong」在歌曲里的真实时间精确量出来，
//       并直接产出可以贴进 js/config.js 的 specialStarBeatTimeline。
//
// 三条拿到 5 个时间的路径（都不需要你输入秒数）：
//   A. 一键填入：检测出来的鼓点是一条很稳的网格（实测 ≈0.752s 一拍 ≈80BPM），
//      所以直接提供「每拍 / 每两拍 / 每四拍一声」三个按钮，先听一下再选。
//   B. 逐个试听：用 ← / → 在候选峰之间跳，跳到哪一个就听哪一个，
//      听准了直接按 1~5 —— 这条路径完全不受反应速度影响，最准。
//   C. 边播边打点：听到 dong 就按 1~5。时间直接取 audio.currentTime；
//      默认还会「吸附到最近候选峰」（±0.25s），用来消掉人手的反应延迟。
//
// 隔离保证（正式页面完全不受影响）：
//   · main.js 只在 ?cueedit=1 时动态 import 本模块，正式页面根本不会加载它；
//   · 启用时正式剧情不启动，避免和编辑器抢同一个音频；
//   · 不碰 photos.js / 星星 / 猫咪 / 蛋糕 / 蜡烛 / 吹气 / 烟花 / 结尾；
//   · 连样式都在启用时才注入 —— 不带参数时页面里没有本模块的任何痕迹。
// ============================================================================

import { birthdayConfig } from "./config.js";

const SRC = (birthdayConfig.music && birthdayConfig.music.src) || "assets/bgm.mp3";
const ANALYZE_SECONDS = 15; // 只看前 15 秒
const CUE_STARS = [3, 7, 11, 16, 19];
const HOP = 256; // 约 5.3ms 一帧（48kHz）
const SNAP_WINDOW = 0.25; // 吸附窗口（秒）

/* ------------------------------ 样式（启用时才注入） ------------------------------ */
const CSS = `
.cue-root {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 16px clamp(12px, 4vw, 40px) 20px;
  background: rgba(4, 6, 14, 0.94);
  color: #e8ecf6;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  overflow: auto;
}
.cue-root h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.4px; }
.cue-root h1 small { font-weight: 400; opacity: 0.55; margin-left: 8px; font-size: 12px; }
.cue-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.cue-root button {
  appearance: none;
  background: rgba(255, 255, 255, 0.08);
  color: #e8ecf6;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 13px;
  cursor: pointer;
}
.cue-root button:hover { background: rgba(255, 255, 255, 0.16); }
.cue-root button.on { background: rgba(255, 205, 130, 0.22); border-color: rgba(255, 205, 130, 0.55); }
.cue-root button:disabled { opacity: 0.4; cursor: default; }
.cue-clock {
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 15px;
  color: #ffd08a;
}
.cue-cand {
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  color: #9fe8c8;
  opacity: 0.9;
}
.cue-root label.cue-check { display: flex; align-items: center; gap: 6px; opacity: 0.85; font-size: 13px; cursor: pointer; }
.cue-picklabel { opacity: 0.62; font-size: 12px; }
.cue-canvas {
  width: 100%;
  height: 200px;
  display: block;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #060912;
  cursor: crosshair;
}
.cue-hint { opacity: 0.62; font-size: 12px; line-height: 1.75; }
.cue-hint b { color: #ffd08a; font-weight: 600; }
.cue-cues { display: flex; flex-direction: column; gap: 5px; }
.cue-cue {
  display: grid;
  grid-template-columns: 68px 92px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 5px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.cue-cue[data-set="1"] { background: rgba(255, 205, 130, 0.10); border-color: rgba(255, 205, 130, 0.35); }
.cue-cue .star { color: #9fc2ff; }
.cue-cue .time {
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: #ffd08a;
  font-size: 15px;
}
.cue-cue .near { opacity: 0.62; font-size: 12px; }
.cue-cue .near i { font-style: normal; color: #ffd7a0; }
.cue-record { display: flex; gap: 8px; flex-wrap: wrap; }
.cue-out { display: flex; gap: 10px; align-items: flex-start; }
.cue-out textarea {
  flex: 1;
  min-height: 132px;
  background: #0b1020;
  color: #d7e3ff;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  padding: 10px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}
.cue-status { opacity: 0.78; font-size: 12px; min-height: 17px; }
`;

function injectStyle() {
  if (document.getElementById("cue-editor-style")) return;
  const el = document.createElement("style");
  el.id = "cue-editor-style";
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ------------------------------ 信号分析 ------------------------------ */

/** 用 OfflineAudioContext 把整段音频滤成一条频带，返回单声道 PCM */
async function renderBand(buffer, type, freq, seconds) {
  const sr = buffer.sampleRate;
  const len = Math.max(1, Math.ceil(seconds * sr));
  const off = new OfflineAudioContext(1, len, sr);
  const src = off.createBufferSource();
  src.buffer = buffer;
  const filter = off.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = type === "lowpass" ? 0.9 : 0.7;
  src.connect(filter);
  filter.connect(off.destination);
  src.start(0);
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

/** 短时能量包络（RMS 就是 short-time energy 的开方） */
function envelope(sig, hop) {
  const n = Math.floor(sig.length / hop);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const base = i * hop;
    for (let k = 0; k < hop; k++) {
      const v = sig[base + k];
      s += v * v;
    }
    env[i] = Math.sqrt(s / hop);
  }
  return env;
}

/** onset / transient 强度：相对「局部均值」的正向突增（自适应阈值，能适应整段动态） */
function onsetStrength(env, winFrames) {
  const n = env.length;
  const st = new Float32Array(n);
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + env[i];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - winFrames);
    const hi = Math.min(n - 1, i + winFrames);
    const mean = (pre[hi + 1] - pre[lo]) / (hi - lo + 1);
    st[i] = Math.max(0, env[i] - mean);
  }
  return st;
}

/**
 * 候选峰。
 *
 * 「dong」的特征：低频（约 &lt;130Hz）能量突然爆发、明显高于它前面那零点几秒，
 * 而且这一瞬间以低频为主（不是 hi-hat / 镲那种高频打击）。
 * 所以打分用三件事，而不是单纯取低频峰值：
 *   level    —— 该帧低频 RMS 在整段里的相对高度（0~1）
 *   burst    —— 相对「前 0.45s~0.08s 基线」的突增，换算成 dB 后归一到 0~1
 *   lowShare —— 低频 / (低频 + 高频)，越接近 1 说明越"闷"，越像 dong
 * score = 0.45*level + 0.35*burst + 0.20*lowShare
 *
 * ⚠️ 这个分数只表示「这一下有多像一个明显的低频击打」，
 * 不表示「是不是你想的那 5 声」—— 最终必须靠耳朵在下面的候选峰之间确认。
 */
function pickCandidates(envLow, envHigh, fps) {
  const n = envLow.length;
  let maxLow = 0;
  for (let i = 0; i < n; i++) if (envLow[i] > maxLow) maxLow = envLow[i] || 1e-9;

  const st = onsetStrength(envLow, Math.round(0.175 * fps));
  let maxSt = 0;
  for (let i = 0; i < n; i++) if (st[i] > maxSt) maxSt = st[i] || 1e-9;

  const peaks = [];
  for (let i = 1; i < n - 1; i++) {
    if (st[i] <= maxSt * 0.02) continue;
    if (st[i] < st[i - 1] || st[i] < st[i + 1]) continue;
    peaks.push(i);
  }
  peaks.sort((a, b) => st[b] - st[a]);
  const minGap = Math.round(0.12 * fps);
  const kept = [];
  for (const i of peaks) {
    if (kept.some((j) => Math.abs(j - i) < minGap)) continue;
    kept.push(i);
  }

  const out = kept.map((i) => {
    const a = Math.max(0, i - Math.round(0.45 * fps));
    const b = Math.max(0, i - Math.round(0.08 * fps));
    let base = 0;
    for (let k = a; k < b; k++) base += envLow[k];
    base = b > a ? base / (b - a) : 0;

    const level = Math.min(1, envLow[i] / maxLow);
    const burstDb = 20 * Math.log10((envLow[i] + 1e-9) / (base + 1e-9));
    const burst = Math.min(1, Math.max(0, burstDb / 12));
    const lowShare = envLow[i] / (envLow[i] + envHigh[i] + 1e-9);

    return {
      time: i / fps,
      level: +level.toFixed(3),
      burstDb: +burstDb.toFixed(1),
      lowShare: +lowShare.toFixed(3),
      score: +(0.45 * level + 0.35 * burst + 0.2 * lowShare).toFixed(3)
    };
  });

  out.sort((a, b) => a.time - b.time);
  return out;
}

async function analyze(buffer) {
  const seconds = Math.min(buffer.duration, ANALYZE_SECONDS);
  const [low, high] = await Promise.all([
    renderBand(buffer, "lowpass", 130, seconds),
    renderBand(buffer, "highpass", 1800, seconds)
  ]);
  const fps = buffer.sampleRate / HOP;
  const envLow = envelope(low, HOP);
  const envHigh = envelope(high, HOP);
  let maxLow = 0;
  let maxHigh = 0;
  for (let i = 0; i < envLow.length; i++) if (envLow[i] > maxLow) maxLow = envLow[i];
  for (let i = 0; i < envHigh.length; i++) if (envHigh[i] > maxHigh) maxHigh = envHigh[i];
  return {
    fps,
    seconds,
    envLow,
    envHigh,
    maxLow: maxLow || 1e-9,
    maxHigh: maxHigh || 1e-9,
    candidates: pickCandidates(envLow, envHigh, fps)
  };
}

/* ------------------------------ 主入口 ------------------------------ */

export function startCueEditor() {
  injectStyle();

  // 编辑模式下不跑正式剧情，把开始按钮收起来
  const intro = document.getElementById("intro");
  if (intro) intro.style.display = "none";

  const root = document.createElement("div");
  root.className = "cue-root";
  root.innerHTML = `
    <h1>Episode 33 cue editor <small>开发调试模式（?cueedit=1）—— 不影响正式页面</small></h1>
    <div class="cue-row">
      <button id="cue-play">▶ 播放</button>
      <button id="cue-restart">⟲ 回到开头</button>
      <button id="cue-prev">◀ 上一个候选峰</button>
      <button id="cue-next">下一个候选峰 ▶</button>
      <button id="cue-clear-all">清空全部 cue</button>
      <label class="cue-check"><input type="checkbox" id="cue-snap" checked> 吸附到最近候选峰（±0.25s，消掉手按的反应延迟）</label>
      <span class="cue-clock" id="cue-clock">music: 0.000s</span>
      <span class="cue-cand" id="cue-cand"></span>
      <span class="cue-status" id="cue-status">正在读取并分析 ${SRC} …</span>
    </div>
    <div class="cue-row">
      <span class="cue-picklabel">一键按检测到的鼓点网格填入（先用 ← → 听一下再决定）：</span>
      <button id="cue-preset-1">每拍一声</button>
      <button id="cue-preset-2">每两拍一声</button>
      <button id="cue-preset-4">每四拍一声（旧配置）</button>
    </div>
    <canvas class="cue-canvas" id="cue-canvas"></canvas>
    <div class="cue-hint">
      浅色区域 = 低频（&lt;130Hz）能量包络 ← dong 就在这里；暗色区域 = 高频（&gt;1800Hz）参考；
      竖线 = 自动检测到的候选峰（亮的为强候选，带时间的已标出）；金色粗线 = 你记录的 cue；绿线 = 播放头。<br>
      <b>空格</b> 播放/暂停 · <b>1 2 3 4 5</b> 记录当前时间为 Cue 1~5 · <b>← →</b> 跳到上/下一个候选峰 ·
      <b>Backspace</b> 撤销最后一个 · <b>点击波形</b> 跳到该时刻<br>
      最准的做法：用 <b>← →</b> 一个个候选峰听过去，听到就是你要的那声 dong 时直接按 <b>1~5</b>。
    </div>
    <div class="cue-cues" id="cue-cues"></div>
    <div class="cue-record" id="cue-record"></div>
    <div class="cue-hint">把下面这段直接贴进 js/config.js 覆盖原来的 specialStarBeatTimeline 即可（不需要你输入任何秒数）：</div>
    <div class="cue-out">
      <textarea id="cue-out" readonly spellcheck="false"></textarea>
      <button id="cue-copy">复制</button>
    </div>
  `;
  document.body.appendChild(root);

  const els = {
    play: root.querySelector("#cue-play"),
    restart: root.querySelector("#cue-restart"),
    prev: root.querySelector("#cue-prev"),
    next: root.querySelector("#cue-next"),
    clearAll: root.querySelector("#cue-clear-all"),
    snap: root.querySelector("#cue-snap"),
    clock: root.querySelector("#cue-clock"),
    cand: root.querySelector("#cue-cand"),
    status: root.querySelector("#cue-status"),
    canvas: root.querySelector("#cue-canvas"),
    cues: root.querySelector("#cue-cues"),
    record: root.querySelector("#cue-record"),
    out: root.querySelector("#cue-out"),
    copy: root.querySelector("#cue-copy")
  };

  const audio = new Audio(SRC);
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";

  const state = {
    ready: false,
    fps: 0,
    seconds: ANALYZE_SECONDS,
    envLow: null,
    envHigh: null,
    maxLow: 1,
    maxHigh: 1,
    candidates: [],
    strongMax: 0,
    candIndex: -1,
    snap: true,
    rawCues: [null, null, null, null, null],
    cues: [null, null, null, null, null]
  };
  window.__cue = state; // 供自动化验收读取；正式页面不会用到

  /* -------- 吸附 -------- */
  function nearestCandidate(t) {
    let best = null;
    let bestD = Infinity;
    for (const c of state.candidates) {
      const d = Math.abs(c.time - t);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best ? { c: best, d: bestD } : null;
  }

  function effectiveFrom(raw) {
    if (raw == null) return null;
    const n = nearestCandidate(raw);
    if (state.snap && n && n.d <= SNAP_WINDOW) return Math.round(n.c.time * 1000) / 1000;
    return raw;
  }

  function resnapAll() {
    state.cues = state.rawCues.map((t) => effectiveFrom(t));
  }

  /* -------- 鼓点网格（用于一键填入） -------- */
  /**
   * 从强候选里抽出「每拍一声」的网格：
   * 相邻强候选的间隔取中位数当作一拍的长度，再以第一个强候选为锚点，
   * 只保留落在网格上的峰（这样同一拍里的二次峰会被剔掉）。
   */
  function kickGrid() {
    const strong = state.candidates.filter((c) => c.score >= state.strongMax && c.time >= 0.5);
    if (strong.length < 3) return [];
    const gaps = [];
    for (let i = 1; i < strong.length; i++) {
      const g = strong[i].time - strong[i - 1].time;
      if (g > 0.35) gaps.push(g);
    }
    if (!gaps.length) return [];
    gaps.sort((a, b) => a - b);
    const beat = gaps[Math.floor(gaps.length / 2)];
    const anchor = strong[0].time;
    return strong
      .filter((c) => {
        const k = Math.round((c.time - anchor) / beat);
        return Math.abs(c.time - (anchor + k * beat)) < beat * 0.18;
      })
      .map((c) => c.time);
  }

  /** 按「每 step 拍一声」填入 5 个 cue（只是填入候选值，之后仍可逐个改） */
  function applyPreset(step) {
    const grid = kickGrid();
    const picked = [];
    for (let i = 0; i < 5; i++) {
      const idx = i * step;
      if (idx >= grid.length) break;
      picked.push(grid[idx]);
    }
    if (picked.length < 5) {
      els.status.textContent =
        `检测到的鼓点只有 ${grid.length} 个，不够按「每 ${step} 拍」填满 5 个，请手动记录`;
      return;
    }
    state.rawCues = picked.map((t) => Math.round(t * 1000) / 1000);
    resnapAll();
    refresh();
  }

  /* -------- 渲染 -------- */
  function intervals() {
    const ts = state.cues.filter((t) => t != null);
    const diffs = [];
    for (let i = 1; i < ts.length; i++) diffs.push(ts[i] - ts[i - 1]);
    return diffs;
  }

  function renderCues() {
    els.cues.innerHTML = "";
    state.cues.forEach((t, i) => {
      const raw = state.rawCues[i];
      const row = document.createElement("div");
      row.className = "cue-cue";
      row.dataset.set = t == null ? "0" : "1";

      let note = "";
      if (t != null) {
        const n = nearestCandidate(t);
        const snapped = raw != null && Math.abs(raw - t) > 0.0005;
        const near = n ? `最近候选峰 ${n.c.time.toFixed(3)}s（差 ${(n.d * 1000).toFixed(0)}ms）` : "附近没有候选峰";
        note = snapped ? `原始 ${raw.toFixed(3)}s → <i>吸附</i> ${t.toFixed(3)}s · ${near}` : near;
        if (n && n.d > 0.12) note += " <i>⚠ 离候选峰较远，确认一下</i>";
      }

      row.innerHTML = `
        <span class="star">star ${CUE_STARS[i]}</span>
        <span class="time">${t == null ? "—" : t.toFixed(3) + "s"}</span>
        <span class="near">${note}</span>
      `;
      const btn = document.createElement("button");
      btn.textContent = "清除";
      btn.disabled = t == null;
      btn.addEventListener("click", () => {
        state.rawCues[i] = null;
        state.cues[i] = null;
        refresh();
      });
      row.appendChild(btn);
      els.cues.appendChild(row);
    });

    els.record.innerHTML = "";
    state.cues.forEach((t, i) => {
      const b = document.createElement("button");
      b.textContent = `记录当前时间为 Cue ${i + 1}`;
      b.dataset.i = String(i);
      if (t != null) b.classList.add("on");
      b.addEventListener("click", () => record(i));
      els.record.appendChild(b);
    });
    els.play.textContent = audio.paused ? "▶ 播放" : "❚❚ 暂停";
  }

  function buildOutput() {
    const missing = state.cues.filter((t) => t == null).length;
    const lines = [];
    if (missing > 0) lines.push(`// 还差 ${missing} 个 cue 没记录（标了「未记录」的行先别用）`);
    lines.push("  specialStarBeatTimeline: [");
    state.cues.forEach((t, i) => {
      const val = t == null ? "0.000 /* 未记录 */" : t.toFixed(3);
      const comma = i === state.cues.length - 1 ? "" : ",";
      lines.push(`    { time: ${val}, star: ${CUE_STARS[i]} }${comma}`);
    });
    lines.push("  ],");
    return lines.join("\n");
  }

  function ascending() {
    const ts = state.cues.filter((t) => t != null);
    for (let i = 1; i < ts.length; i++) if (ts[i] < ts[i - 1]) return false;
    return true;
  }

  function refresh() {
    renderCues();
    els.out.value = buildOutput();
    if (!state.ready) return;
    const done = state.cues.filter((t) => t != null).length;
    const diffs = intervals();
    const parts = [`已记录 ${done}/5`];
    if (diffs.length) {
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      parts.push(
        `间隔 ${diffs.map((d) => d.toFixed(3)).join(" / ")}s（平均 ${avg.toFixed(3)}s` +
          (avg > 0.05 ? ` ≈ ${(60 / avg).toFixed(1)} BPM` : "") +
          "）"
      );
    }
    if (!ascending()) parts.push("⚠ 记录的时间不是递增的，检查顺序");
    els.status.textContent = parts.join(" · ");
  }

  function record(i) {
    if (!state.ready) return;
    const t = audio.currentTime;
    if (!isFinite(t) || t < 0) return;
    state.rawCues[i] = Math.round(t * 1000) / 1000; // 直接来自 audio.currentTime
    state.cues[i] = effectiveFrom(state.rawCues[i]);
    refresh();
  }

  function undo() {
    for (let i = state.cues.length - 1; i >= 0; i--) {
      if (state.cues[i] != null) {
        state.rawCues[i] = null;
        state.cues[i] = null;
        refresh();
        return;
      }
    }
  }

  function gotoCandidate(dir) {
    const cs = state.candidates;
    if (!cs.length) return;
    let i;
    if (dir < 0) {
      i = -1;
      for (let k = cs.length - 1; k >= 0; k--) {
        if (cs[k].time < audio.currentTime - 0.02) {
          i = k;
          break;
        }
      }
      if (i < 0) i = 0;
    } else {
      i = cs.findIndex((c) => c.time > audio.currentTime + 0.02);
      if (i < 0) i = cs.length - 1;
    }
    state.candIndex = i;
    try {
      audio.pause();
    } catch {}
    audio.currentTime = cs[i].time;
    updateCandLabel();
    renderCues();
  }

  function updateCandLabel() {
    const cs = state.candidates;
    if (!cs.length) {
      els.cand.textContent = "";
      return;
    }
    const i = state.candIndex;
    if (i < 0) {
      els.cand.textContent = `候选峰共 ${cs.length} 个`;
      return;
    }
    const c = cs[i];
    els.cand.textContent = `候选峰 ${i + 1}/${cs.length} · ${c.time.toFixed(3)}s · score ${c.score}`;
  }

  /* -------- 画布 -------- */
  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = els.canvas.clientWidth;
    const h = els.canvas.clientHeight;
    if (els.canvas.width !== Math.round(w * dpr) || els.canvas.height !== Math.round(h * dpr)) {
      els.canvas.width = Math.round(w * dpr);
      els.canvas.height = Math.round(h * dpr);
    }
    const ctx = els.canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function draw() {
    const { ctx, w, h } = fitCanvas();
    const T = state.seconds;
    const padL = 10;
    const padR = 10;
    const top = 10;
    const bottom = 8;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - top - bottom);
    const x = (t) => padL + (t / T) * plotW;
    const y = (v) => top + (1 - v) * plotH;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#060912";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.lineWidth = 1;
    for (let s = 0; s <= T; s += 1) {
      ctx.beginPath();
      ctx.moveTo(x(s), top);
      ctx.lineTo(x(s), top + plotH);
      ctx.stroke();
      ctx.fillText(s + "s", x(s) + 2, h - 1);
    }

    const band = (env, maxV, fill) => {
      if (!env) return;
      ctx.beginPath();
      ctx.moveTo(x(0), y(0));
      for (let px = 0; px < plotW; px++) {
        const t0 = (px / plotW) * T;
        const t1 = ((px + 1) / plotW) * T;
        const i0 = Math.floor(t0 * state.fps);
        const i1 = Math.max(i0 + 1, Math.floor(t1 * state.fps));
        let m = 0;
        for (let i = i0; i < i1 && i < env.length; i++) if (env[i] > m) m = env[i];
        ctx.lineTo(x(t0), y(m / maxV));
      }
      ctx.lineTo(x(T), y(0));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    band(state.envHigh, state.maxHigh, "rgba(120, 150, 210, 0.28)");
    band(state.envLow, state.maxLow, "rgba(255, 208, 138, 0.75)");

    // 候选峰
    let lastLabelRight = -Infinity;
    ctx.font = "10px ui-monospace, monospace";
    for (let k = 0; k < state.candidates.length; k++) {
      const c = state.candidates[k];
      const strong = c.score >= state.strongMax;
      const cur = k === state.candIndex;
      ctx.strokeStyle = cur
        ? "rgba(160, 255, 220, 1)"
        : strong
          ? "rgba(255, 235, 200, 0.95)"
          : "rgba(255, 235, 200, 0.28)";
      ctx.lineWidth = cur ? 2.2 : strong ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(x(c.time), top);
      ctx.lineTo(x(c.time), top + plotH);
      ctx.stroke();
      if (strong) {
        // 标签会互相压住就跳过，保证读得清
        const label = c.time.toFixed(3) + "s";
        const lx = x(c.time) + 3;
        const lw = ctx.measureText(label).width;
        if (lx > lastLabelRight + 4 && lx + lw < w - 2) {
          ctx.fillStyle = "rgba(255, 235, 200, 0.95)";
          ctx.fillText(label, lx, top + 10);
          lastLabelRight = lx + lw;
        }
      }
    }

    // 已记录的 cue
    state.cues.forEach((t, i) => {
      if (t == null) return;
      ctx.strokeStyle = "rgba(255, 190, 80, 1)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x(t), top);
      ctx.lineTo(x(t), top + plotH);
      ctx.stroke();
      ctx.fillStyle = "#ffbe50";
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillText(`Cue${i + 1}`, x(t) + 4, top + plotH - 6);
    });

    // 播放头
    const now = audio.currentTime || 0;
    if (now <= T + 0.5) {
      ctx.strokeStyle = "rgba(120, 255, 200, 0.95)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x(now), top);
      ctx.lineTo(x(now), top + plotH);
      ctx.stroke();
    }
  }

  /* -------- 事件 -------- */
  function togglePlay() {
    if (audio.paused) {
      const ctx = window.__cueAudioCtx;
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
      audio.play().catch((err) => {
        els.status.textContent = "无法播放：" + err.message;
      });
    } else {
      audio.pause();
    }
    renderCues();
  }

  els.play.addEventListener("click", togglePlay);
  els.restart.addEventListener("click", () => {
    audio.currentTime = 0;
    state.candIndex = -1;
    updateCandLabel();
  });
  els.prev.addEventListener("click", () => gotoCandidate(-1));
  els.next.addEventListener("click", () => gotoCandidate(1));
  root.querySelector("#cue-preset-1").addEventListener("click", () => applyPreset(1));
  root.querySelector("#cue-preset-2").addEventListener("click", () => applyPreset(2));
  root.querySelector("#cue-preset-4").addEventListener("click", () => applyPreset(4));
  els.clearAll.addEventListener("click", () => {
    state.rawCues = [null, null, null, null, null];
    state.cues = [null, null, null, null, null];
    refresh();
  });
  els.snap.addEventListener("change", () => {
    state.snap = els.snap.checked;
    resnapAll();
    refresh();
  });
  els.canvas.addEventListener("click", (e) => {
    const rect = els.canvas.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = frac * state.seconds;
  });
  els.copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(els.out.value);
      els.status.textContent = "已复制到剪贴板";
    } catch {
      els.out.select();
      els.status.textContent = "请手动复制（浏览器未授权剪贴板）";
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
    } else if (e.key >= "1" && e.key <= "5") {
      e.preventDefault();
      record(Number(e.key) - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      gotoCandidate(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      gotoCandidate(-1);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      undo();
    }
  });

  /* -------- 启动分析 -------- */
  (async () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      window.__cueAudioCtx = ctx; // 供首次手势里 resume
      const res = await fetch(SRC);
      const arr = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arr);
      const info = await analyze(buffer);
      state.fps = info.fps;
      state.seconds = info.seconds;
      state.envLow = info.envLow;
      state.envHigh = info.envHigh;
      state.maxLow = info.maxLow;
      state.maxHigh = info.maxHigh;
      state.candidates = info.candidates;
      const maxScore = Math.max(...info.candidates.map((c) => c.score), 0);
      state.strongMax = maxScore * 0.62;
      state.ready = true;
      refresh();
      updateCandLabel();

      const strong = info.candidates.filter((c) => c.score >= state.strongMax);
      els.status.textContent =
        `已记录 0/5 · 前 ${info.seconds.toFixed(1)}s 检测到 ${info.candidates.length} 个候选峰，` +
        `其中强候选 ${strong.length} 个。用 ← → 一个个听过去最准。`;
      console.log("[cue] candidates", info.candidates);
      console.log("[cue] strong times", strong.map((c) => c.time));
    } catch (err) {
      console.error("[cue] 分析失败", err);
      els.status.textContent = "分析失败：" + err.message;
    }
  })();

  (function loop() {
    const t = audio.currentTime || 0;
    els.clock.textContent = `music: ${t.toFixed(3)}s`;
    draw();
    requestAnimationFrame(loop);
  })();

  refresh();
  updateCandLabel();

  return { state, audio, record, refresh, gotoCandidate };
}
