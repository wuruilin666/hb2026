import { birthdayConfig } from "./config.js";

const TOTAL_MEMORIES = birthdayConfig.memories.length;

export const photos = {
  card: null,
  img: null,
  closeBtn: null,
  isOpen: false,
  activeStar: null,
  viewedStars: new Set(),
  openedStars: new Set(),

  init() {
    this.card = document.getElementById("photo-card");
    this.img = document.getElementById("photo-img");
    this.closeBtn = this.card.querySelector(".photo-close");

    this.closeBtn.addEventListener("click", () => this.close());
    this.card.addEventListener("click", (e) => {
      if (e.target === this.card) this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  },

  openForStar(starIndex) {
    const memory = birthdayConfig.memories.find((m) => m.star === starIndex);
    if (!memory || !this.img) return;
    // Opening a new photo implicitly finishes viewing the previous one
    if (this.activeStar != null && this.activeStar !== starIndex) {
      this.viewedStars.add(this.activeStar);
    }
    this.activeStar = starIndex;
    this.openedStars.add(starIndex);
    this.img.src = memory.image;
    this.card.classList.add("open");
    this.card.setAttribute("aria-hidden", "false");
    this.isOpen = true;
  },

  close() {
    if (!this.card) return;
    // Closing counts as "viewed"
    if (this.activeStar != null) {
      this.viewedStars.add(this.activeStar);
    }
    this.card.classList.remove("open");
    this.card.setAttribute("aria-hidden", "true");
    this.isOpen = false;
    this.activeStar = null;
  },

  areAllViewed() {
    return this.viewedStars.size >= TOTAL_MEMORIES;
  },

  reset() {
    this.viewedStars.clear();
    this.openedStars.clear();
  }
};