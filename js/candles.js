import { birthdayConfig } from "./config.js";
import { wait } from "./utils.js";

export class Candles {
  constructor(wishEl) {
    this.wishEl = wishEl;
    this.slots = Array.from(document.querySelectorAll(".candle-slot"));
    this.wishTimeout = null;
  }

  lightSlot(index) {
    const slot = this.slots[index];
    if (!slot) return;
    slot.classList.add("lit");
  }

  async showWish(text, duration = null) {
    this.clearWish();
    await wait(120);
    this.wishEl.textContent = text;
    this.wishEl.classList.add("show");
    if (duration) {
      this.wishTimeout = setTimeout(() => this.clearWish(), duration);
    }
  }

  clearWish() {
    this.wishEl.classList.remove("show");
    if (this.wishTimeout) {
      clearTimeout(this.wishTimeout);
      this.wishTimeout = null;
    }
  }

  brightenAll() {
    this.slots.forEach((slot) => slot.classList.add("brighten"));
  }

  async extinguishAll() {
    this.slots.forEach((slot) => {
      slot.classList.remove("lit", "brighten");
      slot.classList.add("extinguished");
    });
  }

  async sequence(cat, audio) {
    const cfg = birthdayConfig.timing;
    cat.holdCake();

    for (let i = 0; i < 3; i++) {
      cat.lookDown();
      await cat.insertCandle(800, 650);
      this.lightSlot(i);
      if (audio) audio.chime();
      cat.holdCake();
      await this.showWish(birthdayConfig.wishes[i], cfg.candlePauseAfterInsert + 400);
      await wait(cfg.candlePauseAfterInsert);
    }

    // Fourth candle
    cat.lookDown();
    await cat.insertCandle(1100, 800);
    this.lightSlot(3);
    if (audio) audio.chime();
    cat.lookUp();
    await wait(500);
    this.brightenAll();
    await wait(cfg.candle4BrightenDuration);
    await this.showWish(birthdayConfig.birthdayLine, 2000);
    await wait(1800);
    this.clearWish();
  }
}
