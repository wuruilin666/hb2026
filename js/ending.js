import { birthdayConfig } from "./config.js";
import { wait } from "./utils.js";

export class Ending {
  constructor(container, viewport) {
    this.container = container;
    this.viewport = viewport;
  }

  async play() {
    const lines = birthdayConfig.ending;
    const delays = birthdayConfig.timing.endingLineDelays;
    const fadeOut = birthdayConfig.timing.endingFadeOut;
    const betweenGap = birthdayConfig.timing.endingBetweenGap;

    for (let i = 0; i < lines.length; i++) {
      const el = document.createElement("div");
      el.className = "ending-line" + (i === 2 ? " big" : "");
      el.textContent = lines[i];
      this.container.appendChild(el);
      // force reflow
      void el.offsetWidth;
      el.classList.add("show");
      // 停留时间：根据该行文字长度微调，最后一句更久
      const baseHold = delays[i] ?? 3000;
      const lengthBonus = Math.min(1500, (lines[i] || "").length * 50);
      await wait(baseHold + lengthBonus);
      el.classList.remove("show");
      await wait(fadeOut + (i < lines.length - 1 ? betweenGap : 0));
      el.remove();
    }

    // 文字全部结束后的明显情绪缓冲
    await wait(birthdayConfig.timing.finalPreFadeQuiet);
    this.viewport.classList.add("final-dim");
    await wait(birthdayConfig.timing.finalFadeDuration);
  }
}
