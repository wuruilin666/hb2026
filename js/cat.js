import { wait } from "./utils.js";

/**
 * 各部位在 viewBox 用户坐标系里的姿势值。
 *
 * 统一只用「translate(x,y) rotate(a) translateY(d)」这一种形式，
 * 配合 css/style.css 里给 #cat-head / #arm-left / #arm-right 钉死的
 * `transform-origin: 0 0`，语义等同于 SVG transform 属性：
 * 先平移到 (x,y)，再绕 (x,y) 旋转 —— 任何浏览器算出来都是同一个矩阵。
 *
 * 这些数值与原 css 里的姿势值、以及 index.html 里各 <g> 的 transform 属性完全一致：
 *   #cat-head  translate(210,158) / #arm-left translate(130,330) / #arm-right translate(290,330)
 */
const HEAD = {
  base: "translate(210px, 158px)",
  down: "translate(210px, 165px) rotate(6deg)",
  up: "translate(210px, 155px) rotate(-8deg)"
};

const ARM_LEFT = {
  base: "translate(130px, 330px)",
  holding: "translate(130px, 330px) rotate(10deg) translateY(-10px)"
};

const ARM_RIGHT = {
  base: "translate(290px, 330px)",
  holding: "translate(290px, 330px) rotate(-10deg) translateY(-10px)",
  raise: "translate(290px, 260px) rotate(-110deg)",
  insert: "translate(290px, 340px) rotate(-20deg)"
};

export class Cat {
  constructor(wrap, heldCandle) {
    this.wrap = wrap;
    this.heldCandle = heldCandle;
    // 直接拿这三个 <g>：姿势变换由本模块写内联 transform，不再走 CSS 类。
    this.head = document.getElementById("cat-head");
    this.armLeft = document.getElementById("arm-left");
    this.armRight = document.getElementById("arm-right");
  }

  /**
   * 写姿势值。用内联 style.transform（而不是 SVG transform 属性），
   * 因为属性变换无法参与 CSS 过渡 —— 用属性会让插蜡烛的抬臂/插入
   * 从 0.9s / 0.7s 的平滑动作变成瞬间跳变。
   * 而 transform-origin 已在 CSS 里钉死为 0 0，矩阵与属性写法完全等价。
   */
  apply(el, value) {
    if (el) el.style.transform = value;
  }

  resetPose() {
    this.wrap.className = "cat-wrap";
    this.apply(this.head, HEAD.base);
    this.apply(this.armLeft, ARM_LEFT.base);
    this.apply(this.armRight, ARM_RIGHT.base);
  }

  setPose(...names) {
    this.resetPose();
    names.forEach((n) => this.wrap.classList.add(n));
    if (names.includes("holding-cake")) {
      this.apply(this.armLeft, ARM_LEFT.holding);
      this.apply(this.armRight, ARM_RIGHT.holding);
    }
  }

  holdCake() {
    this.setPose("holding-cake");
  }

  lookDown() {
    this.wrap.classList.add("looking-down");
    this.apply(this.head, HEAD.down);
  }

  lookUp() {
    this.wrap.classList.remove("looking-down");
    this.wrap.classList.add("looking-up");
    this.apply(this.head, HEAD.up);
  }

  async insertCandle(raiseDuration = 900, insertDuration = 700) {
    this.wrap.classList.add("raise-right");
    this.apply(this.armRight, ARM_RIGHT.raise);
    if (this.heldCandle) this.heldCandle.style.opacity = "1";
    await wait(raiseDuration);

    this.wrap.classList.remove("raise-right");
    this.wrap.classList.add("insert-right");
    this.apply(this.armRight, ARM_RIGHT.insert);
    await wait(insertDuration);

    // Snap back to holding cake; the actual candle on the cake is lit separately
    this.wrap.classList.remove("insert-right");
    this.apply(this.armRight, ARM_RIGHT.holding);
    if (this.heldCandle) this.heldCandle.style.opacity = "0";
  }

  pause() {
    this.wrap.classList.remove("looking-down");
    // 与原来的 CSS 级联行为一致：只有没在 looking-up 时才把头复位
    if (!this.wrap.classList.contains("looking-up")) this.apply(this.head, HEAD.base);
  }
}
