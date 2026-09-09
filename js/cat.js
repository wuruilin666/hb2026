import { wait } from "./utils.js";

export class Cat {
  constructor(wrap, heldCandle) {
    this.wrap = wrap;
    this.heldCandle = heldCandle;
  }

  resetPose() {
    this.wrap.className = "cat-wrap";
  }

  setPose(...names) {
    this.resetPose();
    names.forEach((n) => this.wrap.classList.add(n));
  }

  holdCake() {
    this.setPose("holding-cake");
  }

  lookDown() {
    this.wrap.classList.add("looking-down");
  }

  lookUp() {
    this.wrap.classList.remove("looking-down");
    this.wrap.classList.add("looking-up");
  }

  async insertCandle(raiseDuration = 900, insertDuration = 700) {
    this.wrap.classList.add("raise-right");
    if (this.heldCandle) this.heldCandle.style.opacity = "1";
    await wait(raiseDuration);

    this.wrap.classList.remove("raise-right");
    this.wrap.classList.add("insert-right");
    await wait(insertDuration);

    // Snap back to holding cake; the actual candle on the cake is lit separately
    this.wrap.classList.remove("insert-right");
    if (this.heldCandle) this.heldCandle.style.opacity = "0";
  }

  pause() {
    this.wrap.classList.remove("looking-down");
  }
}
