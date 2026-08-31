export type NCPAActivityPackageContext = {
  apiVersion: 1;
  event: {
    eventId: string;
    name: string;
    eyebrow: string;
    subtitle: string;
    dateLabel: string;
    status: "active" | "closed";
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

declare global {
  interface Window {
    NCPAActivity: {
      readonly apiVersion: 1;
      getContext(): Promise<NCPAActivityPackageContext>;
      openScanner(): Promise<unknown>;
    };
  }
}

export {};
