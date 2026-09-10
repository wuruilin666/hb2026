export const birthdayConfig = {
  memories: [
    { star: 3, image: "assets/memory-01.jpg" },
    { star: 7, image: "assets/memory-02.jpg" },
    { star: 11, image: "assets/memory-03.jpg" },
    { star: 16, image: "assets/memory-04.jpg" },
    { star: 19, image: "assets/memory-05.jpg" }
  ],
  wishes: [
    "希望你现在付出的真心，生活都会十倍还给你。",
    "希望以后遇到糟心事的时候依然有锋芒，\n但也越来越从容。",
    "愿你以后的路走得顺一点，再顺一点。\n远离无谓的是非，少遇糟心的人和事，\n把时间留给真正值得的人和喜欢的生活。"
  ],
  birthdayLine: "生日快乐。",
  blowDialog: ["好了，现在轮到你了。", "请对着屏幕吹一口气吧。"],

  // 背景音乐：把你自己的音乐文件放进 assets/，然后填到 src 里即可。
  // 例如 src: "assets/bgm.mp3"
  // 留空 "" 则使用内置合成音乐。文件加载失败会自动回退到合成音乐，不会中断剧情。
  music: {
    src: "assets/bgm.mp3",
    volume: 0.6, // 整体音量 0~1
    loop: true, // 播完是否循环（曲子比剧情短就开 true）
    fadeIn: 4, // 开场淡入秒数
    // 各阶段音量倍率（0~1），相对于上面的 volume
    phases: {
      stars: 0.75,
      cat: 0.85,
      candle: 1,
      blow: 0.4,
      firework: 1,
      ending: 0.7
    }
  },

  ending: [
    "陪伴欧巴的第七年",
    "只是希望以后的人生都是坦途。",
    "生日快乐，徐瑞繁。",
    "进入二十岁，不需要一夜之间变得成熟。",
    "接纳现在的自己和处境，\n我会永远支持你。"
  ],
  timing: {
    starAppearBase: 520,
    starAppearRamp: 14,
    starPauseAfterAll: 2600,
    memoryModeDuration: 8000,
    cameraDownDuration: 8500,
    catIntroPause: 1600,
    candleInsertDuration: 1700,
    candlePauseAfterInsert: 3400,
    candle4BrightenDuration: 1400,
    cakeForwardDuration: 3500,
    blowFallbackMs: 5200,
    blowExtinguishDelay: 350,

    // 烟花 3 段式：quiet(开) → build(渐盛) → finale(20)
    fireworksQuietDelay: 700,
    fireworksDuration: 22000,        // 整体时长
    fireworksBuildFraction: 0.30,    // build 阶段起点
    fireworksFinaleFraction: 0.70,  // finale 阶段起点
    number20HoldDuration: 5000,      // "20" 静止停留
    number20TwinkleDuration: 2500,   // "20" 缓慢闪烁
    number20DriftDuration: 3500,    // 20 → 星空 散开
    postFireworksQuiet: 2400,        // 20 消散后安静时长

    // 结尾节奏
    endingLineDelays: [2500, 2500, 3500, 3500, 5000], // 每条文字停留
    endingFadeOut: 1200,            // 单条文字淡出
    endingBetweenGap: 800,           // 两条文字之间额外停顿
    finalPreFadeQuiet: 2800,         // 文字全部结束后、整体淡出前的安静
    finalFadeDuration: 3200          // 整体变暗
  }
};

export const colors = {
  skyTop: "#020205",
  skyBottom: "#0b1430",
  cloud: "#1a2744",
  tree: "#0d1f14",
  candle: "#fff8e7",
  flameCore: "#fff7d6",
  flameOuter: "#ffcc66",
  glow: "rgba(255, 190, 80, 0.45)",
  text: "#f4f1ea"
};
