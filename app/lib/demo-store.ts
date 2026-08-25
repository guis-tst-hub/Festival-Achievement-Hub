export type FestivalStatus = "active" | "closed";

export type FestivalCategory = {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
};

export type FestivalAchievement = {
  id: string;
  claimCode: string;
  name: string;
  description: string;
  icon: string;
  categoryId: string;
  enabled: boolean;
  sortOrder: number;
  hidden?: boolean;
};

export type FestivalConfig = {
  eventId: string;
  name: string;
  eyebrow: string;
  subtitle: string;
  dateLabel: string;
  status: FestivalStatus;
  categories: FestivalCategory[];
  achievements: FestivalAchievement[];
};

export type UnlockRecord = {
  unlockedAt: string;
  source: "qr" | "visit";
};

export type UnlockState = {
  version: 1;
  unlocked: Record<string, UnlockRecord>;
};

export const CONFIG_STORAGE_KEY = "festival-demo-config:v1";
export const CONFIG_CHANGED_EVENT = "festival-demo-config-changed";

export const defaultFestivalConfig: FestivalConfig = {
  eventId: "halloween-2026",
  name: "万圣夜巡",
  eyebrow: "雾隐学院 · 2026",
  subtitle: "穿过校园里的薄雾，收集只在今夜出现的秘密印记。",
  dateLabel: "10.31 / 日落之后",
  status: "active",
  categories: [
    {
      id: "first-signs",
      name: "初见异象",
      description: "踏入夜色后最先遇见的微小异常",
      sortOrder: 10,
    },
    {
      id: "night-exploration",
      name: "夜行档案",
      description: "藏在校园角落里的深夜线索",
      sortOrder: 20,
    },
  ],
  achievements: [
    {
      id: "ach_moon_gate",
      claimCode: "moon-gate-01",
      name: "踏入夜幕",
      description: "在月亮升起后打开万圣夜巡档案。",
      icon: "☾",
      categoryId: "first-signs",
      enabled: true,
      sortOrder: 10,
    },
    {
      id: "ach_ghost_room",
      claimCode: "ghost-room-8f32",
      name: "幽灵房间",
      description: "发现旧教学楼里那间不存在的房间。",
      icon: "♧",
      categoryId: "first-signs",
      enabled: true,
      sortOrder: 20,
    },
    {
      id: "ach_lantern_keeper",
      claimCode: "lantern-keeper-13",
      name: "守灯人",
      description: "找到仍在为夜行者亮着的那盏灯。",
      icon: "✦",
      categoryId: "night-exploration",
      enabled: true,
      sortOrder: 10,
    },
    {
      id: "ach_pumpkin_scout",
      claimCode: "pumpkin-scout-31",
      name: "南瓜侦察员",
      description: "识破藏在人群中的南瓜伪装。",
      icon: "◒",
      categoryId: "night-exploration",
      enabled: true,
      sortOrder: 20,
    },
    {
      id: "ach_raven_listener",
      claimCode: "raven-listener-07",
      name: "听鸦者",
      description: "听懂钟楼黑鸦留下的三个音节。",
      icon: "⌁",
      categoryId: "night-exploration",
      enabled: true,
      sortOrder: 30,
    },
    {
      id: "ach_midnight_witness",
      claimCode: "midnight-witness-00",
      name: "午夜见证人",
      description: "隐藏成就：在最后一声钟响后抵达终点。",
      icon: "◷",
      categoryId: "night-exploration",
      enabled: true,
      sortOrder: 40,
      hidden: true,
    },
  ],
};

export function getUnlockStorageKey(eventId: string) {
  return `festivalAchievements:${eventId}`;
}

export function loadFestivalConfig(): FestivalConfig {
  if (typeof window === "undefined") return defaultFestivalConfig;

  try {
    const saved = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!saved) return defaultFestivalConfig;
    return { ...defaultFestivalConfig, ...JSON.parse(saved) } as FestivalConfig;
  } catch {
    return defaultFestivalConfig;
  }
}

export function saveFestivalConfig(config: FestivalConfig) {
  window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT));
}

export function loadUnlockState(eventId: string): UnlockState {
  if (typeof window === "undefined") return { version: 1, unlocked: {} };

  try {
    const saved = window.localStorage.getItem(getUnlockStorageKey(eventId));
    if (!saved) return { version: 1, unlocked: {} };
    return JSON.parse(saved) as UnlockState;
  } catch {
    return { version: 1, unlocked: {} };
  }
}

export function saveUnlockState(eventId: string, state: UnlockState) {
  window.localStorage.setItem(getUnlockStorageKey(eventId), JSON.stringify(state));
}

export function resetDemoData() {
  window.localStorage.removeItem(CONFIG_STORAGE_KEY);
  Object.keys(window.localStorage)
    .filter((key) => key.startsWith("festivalAchievements:"))
    .forEach((key) => window.localStorage.removeItem(key));
  window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT));
}
