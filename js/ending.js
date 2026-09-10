import { birthdayConfig } from "./config.js";
import { wait } from "./utils.js";

export class Ending {
  constructor(container, viewport) {
    this.container = container;
    this.viewport = viewport;
  }

  async play() {
    // 文字全部来自 config，不在代码里写死任何一句。
    const lines = birthdayConfig.ending;
    const t = birthdayConfig.timing;
    const delays = t.endingLineDelays || [];
    const fadeOut = t.endingFadeOut;
    const lastFadeOut = t.endingLastFadeOut ?? fadeOut;
    const betweenGap = t.endingBetweenGap;

    for (let i = 0; i < lines.length; i++) {
      const isLast = i === lines.length - 1;
      const el = document.createElement("div");
      // 第三句（index 2）是整段结尾的核心大字
      el.className =
        "ending-line" + (i === 2 ? " big" : "") + (isLast ? " last" : "");
      el.textContent = lines[i];
      this.container.appendChild(el);
      // force reflow
      void el.offsetWidth;
      el.classList.add("show");

      // 停留时间：根据该行文字长度微调，最后一句额外停留更久
      const baseHold = delays[i] ?? 3000;
      const lengthBonus = Math.min(1500, (lines[i] || "").length * 50);
      await wait(baseHold + lengthBonus + (isLast ? 1200 : 0));

      el.classList.remove("show");
      // 中间几句淡出后接下一句；最后一句淡得更慢，且结束后不再有下一句
      if (isLast) {
        await wait(lastFadeOut);
      } else {
        await wait(fadeOut + betweenGap);
      }
      el.remove();
    }

    // 文字全部结束后的安静星空，然后整体缓慢变暗，不做任何收尾按钮/文案
    await wait(t.finalPreFadeQuiet);
    this.viewport.classList.add("final-dim");
    await wait(t.finalFadeDuration);
  }
}
