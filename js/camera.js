import { once } from "./utils.js";

export class Camera {
  constructor(worldEl, viewportEl, catWrap, cakeWrap) {
    this.world = worldEl;
    this.viewport = viewportEl;
    this.catWrap = catWrap;
    this.cakeWrap = cakeWrap;
  }

  async down() {
    this.world.classList.add("camera-down");
    await once(this.world, "animationend");
  }

  async cakeForward() {
    this.viewport.classList.add("cake-forward");
    this.catWrap.classList.add("exit");
    await Promise.race([
      once(this.cakeWrap, "animationend"),
      once(this.catWrap, "animationend")
    ]);
  }
}
