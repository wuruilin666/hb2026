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

  // 结尾三句。最后一句是整个网页的核心文字，会以大字呈现并停留更久。
  ending: [
    "陪伴欧巴的第七年",
    "只是希望以后的人生都是坦途。",
    "生日快乐，徐瑞繁。"
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

    // 吹灭蜡烛后：蛋糕离场节奏（熄灭 → 停留 → 淡出退去 → 短暂黑暗 → 烟花）
    cakeDismissDelay: 700,           // 蜡烛熄灭后，蛋糕原地短暂停留
    cakeDismissDuration: 1000,       // 蛋糕淡出 / 向后下方退去的时长
    cakeDismissDropVh: 6,            // 退去时向下漂移的幅度（vh）
    postCakeDarkness: 300,           // 蛋糕消失后、烟花前的短暂黑暗停顿

    // 烟花：build(起) → peak(最盛) → forming(聚成 20) → hold → drift
    fireworksQuietDelay: 700,
    fireworksDuration: 22000,           // 前三个阶段的基准时长
    fireworksBuildFraction: 0.30,       // 由缓入密的转折点
    fireworksFormFraction: 0.68,        // 开始准备 20：烟花数量明显减少
    fireworksGatherFraction: 0.78,      // 明显朝数字聚集，之后不再放新烟花
    fireworksFormEndFraction: 0.88,     // 目标点全部生成，"20" 完整
    number20HoldDuration: 5000,          // "20" 完整保持（4~5 秒）
    number20DriftDuration: 3500,        // "20" → 星光的散开时长
    postFireworksQuiet: 2400,           // 散完之后的安静星空

    // 结尾节奏（三条：陪伴 / 坦途 / 生日快乐，徐瑞繁。最后一句是核心大字，停留最久）
    endingLineDelays: [2500, 3000, 6000], // 每条文字停留
    endingFadeOut: 1200,            // 单条文字淡出
    endingLastFadeOut: 2600,         // 最后一句核心文字要淡得更慢
    endingBetweenGap: 800,           // 两条文字之间额外停顿
    finalPreFadeQuiet: 3200,         // 文字全部结束后、整体淡出前的安静星空
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
