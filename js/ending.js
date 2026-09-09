import { birthdayConfig } from "./config.js";
import { wait } from "./utils.js";

export class Ending {
  constructor(container, viewport) {
    this.container = container;
    this.viewport = viewport;
  }

  async play() {
    const lines = birthdayConfig.ending;
    const delay = birthdayConfig.timing.endingLineDelay;

    for (let i = 0; i < lines.length; i++) {
      const el = document.createElement("div");
      el.className = "ending-line" + (i === 2 ? " big" : "");
      el.textContent = lines[i];
      this.container.appendChild(el);
      // force reflow
      void el.offsetWidth;
      el.classList.add("show");
      await wait(delay + lines[i].length * 45);
      el.classList.remove("show");
      await wait(700);
      el.remove();
    }

    await wait(400);
    this.viewport.classList.add("final-dim");
    await wait(birthdayConfig.timing.finalFadeDuration);
  }
}
