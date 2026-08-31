import type { FestivalConfig, UnlockState } from "./demo-store";

export const ACTIVITY_PACKAGE_API_VERSION = 1 as const;

export type ActivityPackageContext = {
  apiVersion: typeof ACTIVITY_PACKAGE_API_VERSION;
  event: {
    eventId: string;
    name: string;
    eyebrow: string;
    subtitle: string;
    dateLabel: string;
    status: FestivalConfig["status"];
  };
  categories: Array<{
    id: string;
    name: string;
    description: string;
    sortOrder: number;
  }>;
  achievements: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    categoryId: string;
    sortOrder: number;
    hidden: boolean;
    unlocked: boolean;
    unlockedAt: string | null;
  }>;
  progress: {
    unlocked: number;
    total: number;
    percent: number;
  };
  capabilities: ["get-context", "open-scanner"];
};

export type ActivityPackageRequest =
  | { type: "ncpa:activity-package:get-context"; requestId: string }
  | { type: "ncpa:activity-package:open-scanner"; requestId: string };

export type ActivityPackageResponse =
  | { type: "ncpa:activity-package:context"; requestId: string; context: ActivityPackageContext }
  | { type: "ncpa:activity-package:scanner-opened"; requestId: string }
  | { type: "ncpa:activity-package:error"; requestId: string; message: string };

export function createActivityPackageContext(config: FestivalConfig, unlockState: UnlockState): ActivityPackageContext {
  const activeAchievements = config.achievements
    .filter((achievement) => achievement.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const unlocked = activeAchievements.filter((achievement) => unlockState.unlocked[achievement.id]).length;

  return {
    apiVersion: ACTIVITY_PACKAGE_API_VERSION,
    event: {
      eventId: config.eventId,
      name: config.name,
      eyebrow: config.eyebrow,
      subtitle: config.subtitle,
      dateLabel: config.dateLabel,
      status: config.status,
    },
    categories: config.categories
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder),
    achievements: activeAchievements.map((achievement) => {
      const record = unlockState.unlocked[achievement.id];
      const concealed = Boolean(achievement.hidden && !record);
      return {
        id: achievement.id,
        name: concealed ? "未知成就" : achievement.name,
        description: concealed ? "完成特殊条件后揭晓" : achievement.description,
        icon: concealed ? "" : achievement.icon,
        categoryId: achievement.categoryId,
        sortOrder: achievement.sortOrder,
        hidden: Boolean(achievement.hidden),
        unlocked: Boolean(record),
        unlockedAt: record?.unlockedAt ?? null,
      };
    }),
    progress: {
      unlocked,
      total: activeAchievements.length,
      percent: activeAchievements.length ? Math.round((unlocked / activeAchievements.length) * 100) : 0,
    },
    capabilities: ["get-context", "open-scanner"],
  };
}

export function isActivityPackageRequest(value: unknown): value is ActivityPackageRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.requestId === "string"
    && (candidate.type === "ncpa:activity-package:get-context"
      || candidate.type === "ncpa:activity-package:open-scanner");
}
