import { birthdayConfig } from "./config.js";
import { wait, random, randomInt } from "./utils.js";
import { photos } from "./photos.js";

const TOTAL_STARS = 20;
const SPECIAL_SET = new Set(birthdayConfig.memories.map((m) => m.star));

export class Stars {
  constructor(container) {
    this.container = container;
    this.stars = [];
    this.built = false;
  }

  build() {
    if (this.built) return;
    this.container.innerHTML = "";
    this.stars = [];

    for (let i = 1; i <= TOTAL_STARS; i++) {
      const isSpecial = SPECIAL_SET.has(i);
      const el = document.createElement("div");
      el.className = `star ${isSpecial ? "special" : ""}`;
      el.style.left = `${random(8, 92)}%`;
      el.style.top = `${random(6, 70)}%`;

      const size = isSpecial ? random(5, 7) : random(2, 4);
      const core = document.createElement("span");
      core.className = "star-core";
      core.style.width = `${size}px`;
      core.style.height = `${size}px`;
      el.appendChild(core);

      if (!isSpecial) {
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.transitionDelay = `${random(0, 0.4)}s`;
      } else {
        el.style.width = "26px";
        el.style.height = "26px";
        el.style.marginLeft = "-13px";
        el.style.marginTop = "-13px";
      }

      if (isSpecial) {
        el.addEventListener("click", () => {
          el.classList.add("active");
          setTimeout(() => el.classList.remove("active"), 200);
          photos.openForStar(i);
        });
      }

      this.container.appendChild(el);
      this.stars.push({ index: i, element: el, isSpecial });
    }
    this.built = true;
  }

  async appear() {
    this.build();
    const base = birthdayConfig.timing.starAppearBase;
    const ramp = birthdayConfig.timing.starAppearRamp;

    for (const star of this.stars) {
      await wait(base - star.index * ramp + randomInt(-30, 30));
      star.element.classList.add("visible");
    }

    await wait(birthdayConfig.timing.starPauseAfterAll);

    for (const star of this.stars) {
      star.element.classList.add("twinkle");
    }
  }

  dim() {
    this.stars.forEach((s) => {
      s.element.style.transition = "opacity 1.5s ease";
      s.element.style.opacity = "0.25";
    });
  }
}
