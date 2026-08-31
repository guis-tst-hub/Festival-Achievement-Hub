"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- plain links avoid a vinext dev-runtime duplicate React issue */

import {
  Archive,
  ArrowLeft,
  Boxes,
  CalendarDays,
  Check,
  ChevronRight,
  CirclePlus,
  Download,
  Eye,
  FolderArchive,
  ImageUp,
  LayoutDashboard,
  PackageCheck,
  QrCode,
  RotateCcw,
  Save,
  Settings2,
  SmilePlus,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import JSZip from "jszip";
import QRCode from "qrcode";
import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { AchievementIconGraphic } from "../components/AchievementIconGraphic";
import {
  FestivalAchievement,
  FestivalConfig,
  defaultFestivalConfig,
  loadFestivalConfig,
  saveFestivalConfig,
} from "../lib/demo-store";

type AdminSection = "overview" | "new-activity" | "activity" | "achievements" | "categories" | "packages";

type FestivalSummary = {
  eventId: string;
  name: string;
  eyebrow: string;
  subtitle: string;
  dateLabel: string;
  status: FestivalConfig["status"];
  updatedAt: string;
};

type PackageInspection = {
  fileName: string;
  eventId: string;
  name: string;
  version: string;
  sdkVersion: number;
  entry: string;
  fileCount: number;
  status: "ready" | "published";
};

type ClaimStat = {
  achievementId: string;
  claimCode: string;
  claimedCount: number;
  maxClaims: number;
  enabled: boolean;
};

type NewFestivalDraft = {
  eventId: string;
  name: string;
  eyebrow: string;
  subtitle: string;
  dateLabel: string;
};

type AchievementQrPreview = {
  achievement: FestivalAchievement;
  claimUrl: string;
  dataUrl: string;
  localOnly: boolean;
};

type EmojiTarget =
  | { kind: "draft" }
  | { kind: "achievement"; achievementId: string };

const MAX_ICON_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ICON_DATA_URL_LENGTH = 350_000;
const ACHIEVEMENT_EMOJIS = [
  "✦", "★", "✓", "☀️", "🌙", "⚡", "🔥", "🎉",
  "🏆", "🎭", "🎨", "🎵", "📚", "🔬", "⚽", "🧩",
  "🌟", "💡", "🕯️", "👻", "🎃", "🎄", "🦇", "🔑",
];

const emptyAchievement: Omit<FestivalAchievement, "id"> = {
  claimCode: "",
  name: "",
  description: "",
  icon: "✦",
  categoryId: "",
  enabled: true,
  sortOrder: 10,
  claimLimit: 100,
};

const emptyFestivalDraft: NewFestivalDraft = {
  eventId: "",
  name: "",
  eyebrow: "NCPA · 校园活动",
  subtitle: "",
  dateLabel: "",
};

export function AdminConsole() {
  const [config, setConfig] = useState<FestivalConfig>(defaultFestivalConfig);
  const [section, setSection] = useState<AdminSection>("overview");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [festivals, setFestivals] = useState<FestivalSummary[]>([summaryFromConfig(defaultFestivalConfig)]);
  const [festivalDraft, setFestivalDraft] = useState<NewFestivalDraft>(emptyFestivalDraft);
  const [creatingFestival, setCreatingFestival] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [draft, setDraft] = useState(emptyAchievement);
  const [packageInspection, setPackageInspection] = useState<PackageInspection | null>(null);
  const [packageError, setPackageError] = useState("");
  const [notice, setNotice] = useState("");
  const [claimStats, setClaimStats] = useState<ClaimStat[]>([]);
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const [qrPreview, setQrPreview] = useState<AchievementQrPreview | null>(null);
  const [qrBusyId, setQrBusyId] = useState<string | null>(null);
  const [iconBusyId, setIconBusyId] = useState<string | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<EmojiTarget | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<"connecting" | "online" | "error">("connecting");

  const activeAchievements = useMemo(
    () => config.achievements.filter((achievement) => achievement.enabled).length,
    [config.achievements],
  );
  const totalOnlineClaims = useMemo(
    () => claimStats.reduce((total, stat) => total + stat.claimedCount, 0),
    [claimStats],
  );
  const claimStatsById = useMemo(
    () => Object.fromEntries(claimStats.map((stat) => [stat.achievementId, stat])),
    [claimStats],
  );

  async function loadOnlineState(eventId: string) {
    setOnlineStatus("connecting");
    try {
      const [configResponse, statsResponse] = await Promise.all([
        fetch(`/api/festival?eventId=${encodeURIComponent(eventId)}`),
        fetch(`/api/admin/claims?eventId=${encodeURIComponent(eventId)}`),
      ]);
      if (!configResponse.ok || !statsResponse.ok) throw new Error("在线数据库尚未就绪");
      const configPayload = await configResponse.json() as { config: FestivalConfig };
      const statsPayload = await statsResponse.json() as { stats: ClaimStat[] };
      setConfig(configPayload.config);
      saveFestivalConfig(configPayload.config);
      setDraft((current) => ({ ...current, categoryId: configPayload.config.categories[0]?.id ?? "" }));
      setClaimStats(statsPayload.stats);
      setLimitDrafts(Object.fromEntries(configPayload.config.achievements.map((item) => [item.id, String(item.claimLimit || 100)])));
      setOnlineStatus("online");
      return true;
    } catch {
      setOnlineStatus("error");
      return false;
    }
  }

  async function loadFestivalList() {
    try {
      const response = await fetch("/api/admin/festivals");
      if (!response.ok) throw new Error("活动列表尚未就绪");
      const payload = await response.json() as { festivals: FestivalSummary[] };
      setFestivals(payload.festivals);
      setOnlineStatus("online");
    } catch {
      setOnlineStatus("error");
    }
  }

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const loaded = loadFestivalConfig();
      setConfig(loaded);
      setDraft((current) => ({
        ...current,
        categoryId: loaded.categories[0]?.id ?? "",
      }));
      setLimitDrafts(Object.fromEntries(loaded.achievements.map((item) => [item.id, String(item.claimLimit || 100)])));
      setFestivals([summaryFromConfig(loaded)]);
      void loadFestivalList();
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  async function syncConfigOnline(nextConfig: FestivalConfig) {
    setOnlineStatus("connecting");
    try {
      const response = await fetch("/api/admin/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sync", config: nextConfig }),
      });
      if (!response.ok) throw new Error("同步失败");
      const payload = await response.json() as { config: FestivalConfig; stats: ClaimStat[] };
      setConfig(payload.config);
      saveFestivalConfig(payload.config);
      setClaimStats(payload.stats);
      setFestivals((current) => upsertFestivalSummary(current, summaryFromConfig(payload.config)));
      setOnlineStatus("online");
    } catch {
      setOnlineStatus("error");
      setNotice("本地已保存，但在线校验配置同步失败");
    }
  }

  async function openActivity(eventId: string) {
    const loaded = await loadOnlineState(eventId);
    if (!loaded) {
      setNotice("无法读取该活动，请检查服务器连接");
      return;
    }
    setPackageInspection(null);
    setPackageError("");
    setQrPreview(null);
    setEmojiTarget(null);
    setSelectedEventId(eventId);
    setSection("activity");
  }

  function returnToOverview() {
    setSelectedEventId(null);
    setSection("overview");
    void loadFestivalList();
  }

  function showNewActivity() {
    setSelectedEventId(null);
    setSection("new-activity");
  }

  async function createNewActivity(event: FormEvent) {
    event.preventDefault();
    if (creatingFestival) return;
    setCreatingFestival(true);
    setOnlineStatus("connecting");
    try {
      const response = await fetch("/api/admin/festivals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(festivalDraft),
      });
      const payload = await response.json() as { config?: FestivalConfig; error?: string };
      if (!response.ok || !payload.config) throw new Error(payload.error || "活动创建失败");

      const newConfig = payload.config;
      setConfig(newConfig);
      saveFestivalConfig(newConfig);
      setClaimStats([]);
      setLimitDrafts({});
      setDraft({ ...emptyAchievement, categoryId: "" });
      setFestivals((current) => upsertFestivalSummary(current, summaryFromConfig(newConfig)));
      setFestivalDraft(emptyFestivalDraft);
      setSelectedEventId(newConfig.eventId);
      setSection("activity");
      setOnlineStatus("online");
      setNotice("活动已创建，默认处于未开放状态");
    } catch (error) {
      setOnlineStatus("error");
      setNotice(error instanceof Error ? error.message : "活动创建失败");
    } finally {
      setCreatingFestival(false);
    }
  }

  function persist(nextConfig: FestivalConfig, message = "更改已保存到本地测试数据") {
    setConfig(nextConfig);
    saveFestivalConfig(nextConfig);
    void syncConfigOnline(nextConfig);
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }

  function toggleEventStatus() {
    persist(
      { ...config, status: config.status === "active" ? "closed" : "active" },
      config.status === "active" ? "活动已关闭" : "活动已开启",
    );
  }

  function restoreDemoActivity() {
    if (config.eventId !== defaultFestivalConfig.eventId) {
      setNotice("只有内置演示活动可以恢复默认配置");
      return;
    }
    const clean = defaultFestivalConfig;
    setConfig(clean);
    saveFestivalConfig(clean);
    setDraft({ ...emptyAchievement, categoryId: clean.categories[0]?.id ?? "" });
    setLimitDrafts(Object.fromEntries(clean.achievements.map((item) => [item.id, String(item.claimLimit)])));
    void syncConfigOnline(clean);
    setNotice("演示活动配置已恢复，学生本地成就与领取计数未清除");
  }

  function addCategory(event: FormEvent) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    const id = `category-${crypto.randomUUID().slice(0, 8)}`;
    persist({
      ...config,
      categories: [
        ...config.categories,
        {
          id,
          name,
          description: "等待补充分类说明",
          sortOrder: (config.categories.length + 1) * 10,
        },
      ],
    }, "新分类已加入");
    setCategoryName("");
  }

  function removeCategory(categoryId: string) {
    if (config.achievements.some((achievement) => achievement.categoryId === categoryId)) {
      setNotice("这个分类仍有成就，请先移动成就");
      return;
    }
    persist({
      ...config,
      categories: config.categories.filter((category) => category.id !== categoryId),
    }, "空分类已移除");
  }

  function addAchievement(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.claimCode.trim() || !draft.categoryId) {
      setNotice("请填写名称、识别码和分类");
      return;
    }
    if (config.achievements.some((item) => item.claimCode === draft.claimCode.trim())) {
      setNotice("识别码不能重复");
      return;
    }
    const nextAchievement: FestivalAchievement = {
      ...draft,
      id: `ach_${crypto.randomUUID().slice(0, 8)}`,
      name: draft.name.trim(),
      claimCode: draft.claimCode.trim(),
      description: draft.description.trim() || "等待补充成就说明",
      sortOrder: config.achievements.length * 10 + 10,
    };
    persist({ ...config, achievements: [...config.achievements, nextAchievement] }, "新成就已加入");
    setDraft({ ...emptyAchievement, categoryId: config.categories[0]?.id ?? "" });
  }

  function toggleAchievement(achievementId: string) {
    persist({
      ...config,
      achievements: config.achievements.map((achievement) =>
        achievement.id === achievementId
          ? { ...achievement, enabled: !achievement.enabled }
          : achievement,
      ),
    }, "成就状态已更新");
  }

  function saveClaimLimit(achievementId: string) {
    const parsed = Number.parseInt(limitDrafts[achievementId] ?? "", 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100000) {
      setNotice("领取上限必须是 1 到 100000 的整数");
      return;
    }
    const nextConfig = {
      ...config,
      achievements: config.achievements.map((achievement) =>
        achievement.id === achievementId ? { ...achievement, claimLimit: parsed } : achievement,
      ),
    };
    persist(nextConfig, "领取上限已同步");
  }

  async function resetOnlineCount(achievementId: string) {
    try {
      const response = await fetch("/api/admin/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reset", eventId: config.eventId, achievementId }),
      });
      if (!response.ok) throw new Error("重置失败");
      const payload = await response.json() as { stats: ClaimStat[] };
      setClaimStats(payload.stats);
      setNotice("该成就的在线领取计数已清零");
      setOnlineStatus("online");
    } catch {
      setNotice("领取计数重置失败");
      setOnlineStatus("error");
    }
  }

  async function createAchievementQr(achievement: FestivalAchievement) {
    const claimUrl = new URL("/", window.location.origin);
    claimUrl.searchParams.set("event", config.eventId);
    claimUrl.searchParams.set("unlock", achievement.claimCode);
    const dataUrl = await QRCode.toDataURL(claimUrl.toString(), {
      width: 900,
      margin: 3,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    });
    return {
      achievement,
      claimUrl: claimUrl.toString(),
      dataUrl,
      localOnly: claimUrl.hostname === "localhost" || claimUrl.hostname === "127.0.0.1",
    } satisfies AchievementQrPreview;
  }

  async function showAchievementQr(achievement: FestivalAchievement) {
    setQrBusyId(achievement.id);
    try {
      setQrPreview(await createAchievementQr(achievement));
    } catch {
      setNotice("二维码生成失败，请稍后重试");
    } finally {
      setQrBusyId(null);
    }
  }

  function downloadQr(preview: AchievementQrPreview) {
    const safeEventId = config.eventId.replace(/[^a-z0-9_-]+/gi, "-");
    const safeClaimCode = preview.achievement.claimCode.replace(/[^a-z0-9_-]+/gi, "-");
    const anchor = document.createElement("a");
    anchor.href = preview.dataUrl;
    anchor.download = `${safeEventId}-${safeClaimCode}.png`;
    anchor.click();
  }

  async function downloadAchievementQr(achievement: FestivalAchievement) {
    setQrBusyId(achievement.id);
    try {
      downloadQr(await createAchievementQr(achievement));
    } catch {
      setNotice("二维码下载失败，请稍后重试");
    } finally {
      setQrBusyId(null);
    }
  }

  async function uploadExistingAchievementIcon(achievementId: string, file?: File) {
    if (!file) return;
    setIconBusyId(achievementId);
    try {
      const icon = await prepareAchievementIcon(file);
      persist({
        ...config,
        achievements: config.achievements.map((achievement) =>
          achievement.id === achievementId ? { ...achievement, icon } : achievement,
        ),
      }, "成就图案已更新");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图案上传失败");
    } finally {
      setIconBusyId(null);
    }
  }

  async function uploadDraftAchievementIcon(file?: File) {
    if (!file) return;
    setIconBusyId("draft");
    try {
      const icon = await prepareAchievementIcon(file);
      setDraft((current) => ({ ...current, icon }));
      setNotice("图案已处理，将在保存成就时一并提交");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "图案上传失败");
    } finally {
      setIconBusyId(null);
    }
  }

  function chooseEmoji(emoji: string) {
    if (!emojiTarget) return;
    if (emojiTarget.kind === "draft") {
      setDraft((current) => ({ ...current, icon: emoji }));
      setNotice("已选择 Emoji 图案");
    } else {
      persist({
        ...config,
        achievements: config.achievements.map((achievement) =>
          achievement.id === emojiTarget.achievementId ? { ...achievement, icon: emoji } : achievement,
        ),
      }, "成就图案已更新");
    }
    setEmojiTarget(null);
  }

  async function inspectPackage(file?: File) {
    if (!file) return;
    setPackageError("");
    setPackageInspection(null);
    try {
      if (!file.name.toLowerCase().endsWith(".zip")) {
        throw new Error("活动包必须是ZIP文件");
      }
      const zip = await JSZip.loadAsync(file);
      const files = Object.values(zip.files).filter((entry) => !entry.dir);
      if (!files.length) throw new Error("活动包是空的");
      if (files.some((entry) => entry.name.startsWith("/") || entry.name.includes("../") || entry.name.includes("\\"))) {
        throw new Error("活动包中包含不安全的文件路径");
      }

      const allowedExtensions = new Set([
        "html", "css", "js", "mjs", "json", "png", "jpg", "jpeg", "webp",
        "gif", "svg", "mp3", "ogg", "wav", "woff", "woff2", "txt",
      ]);
      const rejected = files.find((entry) => {
        const extension = entry.name.split(".").pop()?.toLowerCase() ?? "";
        return !allowedExtensions.has(extension);
      });
      if (rejected) throw new Error(`不允许的文件类型：${rejected.name}`);

      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) throw new Error("活动包根目录缺少manifest.json");
      const manifest = JSON.parse(await manifestFile.async("string")) as Record<string, unknown>;
      const eventId = String(manifest.eventId ?? "");
      const entry = String(manifest.entry ?? "index.html");
      const sdkVersion = Number(manifest.sdkVersion);
      if (!eventId || !String(manifest.version ?? "")) throw new Error("manifest缺少eventId或version");
      if (sdkVersion !== 1) throw new Error("manifest的sdkVersion必须为1");
      if (eventId !== config.eventId) throw new Error(`活动包编号应为当前活动：${config.eventId}`);
      if (!zip.file(entry)) throw new Error(`找不到入口页面：${entry}`);

      setPackageInspection({
        fileName: file.name,
        eventId,
        name: String(manifest.name ?? eventId),
        version: String(manifest.version),
        sdkVersion,
        entry,
        fileCount: files.length,
        status: "ready",
      });
    } catch (error) {
      setPackageError(error instanceof Error ? error.message : "活动包检查失败");
    }
  }

  async function downloadSamplePackage() {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({
      eventId: config.eventId,
      name: config.name,
      version: "1.0.0",
      entry: "index.html",
      sdkVersion: 1,
    }, null, 2));
    zip.file("index.html", `<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${config.name}</title>\n  <link rel="stylesheet" href="assets/theme.css">\n</head>\n<body>\n  <main>\n    <p>NCPA ACTIVITY PACKAGE</p>\n    <h1 id="title">${config.name}</h1>\n    <p id="progress">正在读取活动数据</p>\n    <button id="scan">打开二维码扫描器</button>\n  </main>\n  <script src="/activity-package-sdk.js"></script>\n  <script>\n    async function start() {\n      const context = await window.NCPAActivity.getContext();\n      document.querySelector('#title').textContent = context.event.name;\n      document.querySelector('#progress').textContent = context.progress.unlocked + ' / ' + context.progress.total;\n    }\n    document.querySelector('#scan').addEventListener('click', function () {\n      window.NCPAActivity.openScanner().catch(console.error);\n    });\n    start().catch(console.error);\n  </script>\n</body>\n</html>`);
    zip.file("assets/theme.css", "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111115;color:#f5f2e8;font-family:system-ui;text-align:center}main{padding:3rem}button{border:0;border-radius:10px;padding:.8rem 1rem;background:#f0b94f;font:inherit;font-weight:700;cursor:pointer}");
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${config.eventId}-starter.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="admin-shell">
      <div className="admin-mobile-guard">
        <Settings2 size={28} />
        <h1>请在电脑上打开管理台</h1>
        <p>管理员页面按照电脑比例设计，手机端只提供活动体验。</p>
        <a href="/"><ArrowLeft size={15} />返回活动页</a>
      </div>

      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          <span>N</span>
          <div><strong>NCPA</strong><small>FESTIVAL ACHIEVEMENT HUB</small></div>
        </a>
        <nav>
          <AdminNav active={section === "overview"} onClick={returnToOverview} icon={<LayoutDashboard size={18} />} label="活动总览" />
          {!selectedEventId ? <AdminNav active={section === "new-activity"} onClick={showNewActivity} icon={<CirclePlus size={18} />} label="新建活动" /> : null}
          {selectedEventId ? (
            <>
              <div className="admin-nav-context"><span>当前活动</span><strong>{config.name}</strong><small>{config.eventId}</small></div>
              <AdminNav active={section === "activity"} onClick={() => setSection("activity")} icon={<CalendarDays size={18} />} label="活动设置" />
              <AdminNav active={section === "achievements"} onClick={() => setSection("achievements")} icon={<Sparkles size={18} />} label="成就管理" count={config.achievements.length} />
              <AdminNav active={section === "categories"} onClick={() => setSection("categories")} icon={<Boxes size={18} />} label="分类管理" count={config.categories.length} />
              <AdminNav active={section === "packages"} onClick={() => setSection("packages")} icon={<FolderArchive size={18} />} label="活动页面" />
            </>
          ) : null}
        </nav>
        <div className="admin-sidebar-footer">
          <span>本地测试模式</span>
          <p>配置与领取计数在线同步</p>
          <a href="/"><ArrowLeft size={14} />查看手机页面</a>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><span>{section === "overview" || section === "new-activity" ? "NCPA FESTIVAL ACHIEVEMENT HUB" : config.name}</span><h1>{sectionTitle(section)}</h1></div>
          <div className="admin-status"><span className={onlineStatus === "online" ? "active" : ""} />{onlineStatus === "online" ? "校验服务器在线" : onlineStatus === "connecting" ? "正在同步" : "服务器连接失败"}</div>
        </header>

        {section === "overview" ? (
          <div className="admin-content">
            <div className="activity-list-heading">
              <div><span className="panel-kicker">ACTIVITIES</span><h2>活动列表</h2><p>选择一个活动后，再管理它自己的页面、分类和成就。</p></div>
              <div className="activity-list-actions"><span>{festivals.length} 个活动</span><button className="primary-admin-button" onClick={showNewActivity}><CirclePlus size={16} />新建活动</button></div>
            </div>
            <div className="activity-catalog">
              {festivals.map((festival) => (
                <button className="admin-panel activity-card" key={festival.eventId} onClick={() => void openActivity(festival.eventId)}>
                  <div className="activity-card-top"><span className={festival.status === "active" ? "activity-state is-active" : "activity-state"}>{festival.status === "active" ? "开放中" : "未开放"}</span><small>{festival.dateLabel}</small></div>
                  <div><span className="panel-kicker">{festival.eyebrow}</span><h3>{festival.name}</h3><p>{festival.subtitle}</p></div>
                  <footer><code>{festival.eventId}</code><span>进入活动<ChevronRight size={16} /></span></footer>
                </button>
              ))}
              {!festivals.length ? <div className="admin-panel activity-empty"><CalendarDays size={28} /><h3>暂无活动</h3><p>上传第一个活动包后，活动会显示在这里。</p></div> : null}
            </div>
          </div>
        ) : null}

        {section === "new-activity" ? (
          <div className="admin-content new-activity-layout">
            <form className="admin-panel create-form new-activity-form" onSubmit={createNewActivity}>
              <div className="panel-heading">
                <div><span className="panel-kicker">NEW ACTIVITY</span><h2>创建新活动</h2></div>
                <CalendarDays size={21} />
              </div>
              <label>活动名称<input required maxLength={80} value={festivalDraft.name} onChange={(event) => setFestivalDraft({ ...festivalDraft, name: event.target.value })} placeholder="例如：冬日游园会" /></label>
              <label>活动编号<input required minLength={3} maxLength={64} pattern="[a-z0-9][a-z0-9-]{2,63}" value={festivalDraft.eventId} onChange={(event) => setFestivalDraft({ ...festivalDraft, eventId: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="winter-festival-2026" /><small>只允许小写字母、数字和连字符；打印二维码后不要修改。</small></label>
              <label>活动标记<input required maxLength={80} value={festivalDraft.eyebrow} onChange={(event) => setFestivalDraft({ ...festivalDraft, eyebrow: event.target.value })} placeholder="NCPA · 2026" /></label>
              <label>活动说明<textarea required maxLength={240} value={festivalDraft.subtitle} onChange={(event) => setFestivalDraft({ ...festivalDraft, subtitle: event.target.value })} placeholder="简要说明活动主题和参与方式" /></label>
              <label>活动时间<input required maxLength={80} value={festivalDraft.dateLabel} onChange={(event) => setFestivalDraft({ ...festivalDraft, dateLabel: event.target.value })} placeholder="12.20 / 16:00—20:00" /></label>
              <div className="new-activity-form-actions">
                <button className="text-admin-button" type="button" onClick={returnToOverview}><ArrowLeft size={15} />返回总览</button>
                <button className="primary-admin-button" type="submit" disabled={creatingFestival}><Save size={16} />{creatingFestival ? "正在创建" : "创建活动"}</button>
              </div>
            </form>
            <aside className="admin-panel new-activity-notes">
              <span className="panel-kicker">ACTIVITY WORKSPACE</span>
              <h2>创建后再完善内容</h2>
              <p>新活动默认不会立即开放，避免尚未配置完成时被学生扫码访问。</p>
              <ol>
                <li><span>01</span><div><strong>创建活动</strong><small>保存名称、编号、说明和时间。</small></div></li>
                <li><span>02</span><div><strong>配置分类与成就</strong><small>数据只属于这个活动，不与其他活动共用。</small></div></li>
                <li><span>03</span><div><strong>准备活动包</strong><small>每个活动使用与活动编号一致的独立HTML活动包。</small></div></li>
                <li><span>04</span><div><strong>检查后开放</strong><small>确认二维码和页面无误后再开启活动。</small></div></li>
              </ol>
            </aside>
          </div>
        ) : null}

        {section === "activity" ? (
          <div className="admin-content">
            <div className="prototype-banner"><Sparkles size={18} /><div><strong>正在管理：{config.name}</strong><p>下面的分类、成就、领取数量和活动页面都只属于该活动。管理员接口尚未接入登录保护，当前版本只能用于内网测试。</p></div></div>
            <div className="admin-panel event-control">
              <div><span className="panel-kicker">CURRENT EVENT</span><h2>{config.name}</h2><p>{config.subtitle}</p></div>
              <button className={config.status === "active" ? "danger-button" : "primary-admin-button"} onClick={toggleEventStatus}>
                {config.status === "active" ? "关闭活动" : "开启活动"}
              </button>
            </div>
            <div className="metric-grid activity-metrics">
              <Metric label="成就总数" value={String(config.achievements.length)} detail={`${activeAchievements} 个正在启用`} />
              <Metric label="成就分类" value={String(config.categories.length)} detail="仅用于当前活动" />
              <Metric label="在线领取" value={String(totalOnlineClaims)} detail="已通过服务器校验" />
            </div>
            <div className="admin-panel quick-links activity-quick-links">
              <button onClick={() => setSection("achievements")}><Sparkles size={19} /><span><strong>成就管理</strong><small>增加成就、设置识别码和名额</small></span><ChevronRight size={18} /></button>
              <button onClick={() => setSection("categories")}><Boxes size={19} /><span><strong>分类管理</strong><small>管理当前活动的成就分组</small></span><ChevronRight size={18} /></button>
              <button onClick={() => setSection("packages")}><UploadCloud size={19} /><span><strong>活动页面</strong><small>检查并发布当前活动的HTML包</small></span><ChevronRight size={18} /></button>
            </div>
          </div>
        ) : null}

        {section === "achievements" ? (
          <div className="admin-content split-content">
            <section className="admin-panel achievement-list-panel">
              <div className="panel-heading"><div><span className="panel-kicker">ACHIEVEMENTS</span><h2>当前成就</h2></div><span>{config.achievements.length}项</span></div>
              <div className="admin-achievement-list">
                {config.achievements.map((achievement) => {
                  const stat = claimStatsById[achievement.id];
                  return (
                    <article key={achievement.id} className={!achievement.enabled ? "is-disabled" : ""}>
                      <span className="admin-achievement-icon"><AchievementIconGraphic icon={achievement.icon} /></span>
                      <div className="admin-achievement-copy">
                        <strong>{achievement.name}</strong>
                        <small>{achievement.claimCode} · {config.categories.find((category) => category.id === achievement.categoryId)?.name ?? "未分组"}</small>
                        <div className="admin-icon-controls">
                          <label className={iconBusyId === achievement.id ? "is-busy" : ""}>
                            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={iconBusyId === achievement.id} onChange={(event) => { void uploadExistingAchievementIcon(achievement.id, event.target.files?.[0]); event.target.value = ""; }} />
                            <ImageUp size={11} />上传图案
                          </label>
                          <button onClick={() => setEmojiTarget({ kind: "achievement", achievementId: achievement.id })}><SmilePlus size={11} />选择 Emoji</button>
                        </div>
                      </div>
                      <div className="claim-limit-editor">
                        <span>已领 {stat?.claimedCount ?? 0}/{stat?.maxClaims ?? achievement.claimLimit ?? 100}</span>
                        <div><input aria-label={`${achievement.name}领取上限`} type="number" min="1" max="100000" value={limitDrafts[achievement.id] ?? String(achievement.claimLimit || 100)} onChange={(event) => setLimitDrafts({ ...limitDrafts, [achievement.id]: event.target.value })} /><button onClick={() => saveClaimLimit(achievement.id)}>保存</button></div>
                      </div>
                      <div className="claim-row-actions">
                        <button disabled={qrBusyId === achievement.id} onClick={() => void showAchievementQr(achievement)}><Eye size={12} />查看二维码</button>
                        <button disabled={qrBusyId === achievement.id} onClick={() => void downloadAchievementQr(achievement)}><Download size={12} />下载二维码</button>
                        <button onClick={() => void resetOnlineCount(achievement.id)}>清零计数</button>
                        <button onClick={() => toggleAchievement(achievement.id)}>{achievement.enabled ? "停用成就" : "启用成就"}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            <form className="admin-panel create-form" onSubmit={addAchievement}>
              <div className="panel-heading"><div><span className="panel-kicker">NEW RECORD</span><h2>新增成就</h2></div><CirclePlus size={20} /></div>
              <label>成就名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：钟楼见证人" /></label>
              <label>二维码识别码<input value={draft.claimCode} onChange={(event) => setDraft({ ...draft, claimCode: event.target.value })} placeholder="bell-tower-01" /></label>
              <label>成就说明<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="写下解锁条件或发现内容" /></label>
              <div className="new-achievement-icon-field">
                <span className="new-achievement-icon-preview"><AchievementIconGraphic icon={draft.icon} /></span>
                <div>
                  <strong>成就图案</strong>
                  <small>支持 PNG、JPG/JPEG、WebP，最大 5MB；上传后自动裁切并压缩。</small>
                  <div className="new-achievement-icon-actions">
                    <label className={iconBusyId === "draft" ? "is-busy" : ""}>
                      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={iconBusyId === "draft"} onChange={(event) => { void uploadDraftAchievementIcon(event.target.files?.[0]); event.target.value = ""; }} />
                      <ImageUp size={13} />{iconBusyId === "draft" ? "正在处理" : "上传图片"}
                    </label>
                    <button type="button" onClick={() => setEmojiTarget({ kind: "draft" })}><SmilePlus size={13} />选择 Emoji</button>
                  </div>
                </div>
              </div>
              <label>所属分类<select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>{config.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
              <label>领取上限<input type="number" min="1" max="100000" value={draft.claimLimit} onChange={(event) => setDraft({ ...draft, claimLimit: Number.parseInt(event.target.value || "1", 10) })} /></label>
              <button className="primary-admin-button" type="submit"><Save size={16} />保存成就</button>
            </form>
          </div>
        ) : null}

        {section === "categories" ? (
          <div className="admin-content">
            <form className="admin-panel category-create" onSubmit={addCategory}>
              <div><span className="panel-kicker">NEW GROUP</span><h2>创建成就分类</h2></div>
              <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="输入分类名称" />
              <button className="primary-admin-button" type="submit"><CirclePlus size={16} />新增分类</button>
            </form>
            <div className="category-admin-grid">
              {config.categories.map((category) => {
                const count = config.achievements.filter((achievement) => achievement.categoryId === category.id).length;
                return <article className="admin-panel" key={category.id}><span className="category-index">{String(category.sortOrder).padStart(2, "0")}</span><h3>{category.name}</h3><p>{category.description}</p><div><span>{count} 个成就</span><button onClick={() => removeCategory(category.id)}><Archive size={14} />移除</button></div></article>;
              })}
            </div>
          </div>
        ) : null}

        {section === "packages" ? (
          <div className="admin-content package-layout">
            <section className="admin-panel package-upload-panel">
              <span className="panel-kicker">ACTIVITY PACKAGE</span>
              <h2>{config.name}的活动包</h2>
              <p>当前活动对应一个独立ZIP活动包，包内活动编号必须为 <code>{config.eventId}</code>。根目录必须包含manifest.json和入口HTML。</p>
              <label className="package-dropzone">
                <input type="file" accept="application/zip,.zip" onChange={(event: ChangeEvent<HTMLInputElement>) => { void inspectPackage(event.target.files?.[0]); event.target.value = ""; }} />
                <UploadCloud size={30} />
                <strong>选择ZIP活动包</strong>
                <small>这一步只检查包结构，不会上传到服务器</small>
              </label>
              <button className="text-admin-button" onClick={() => void downloadSamplePackage()}>下载活动包模板</button>
              {packageError ? <div className="package-error">{packageError}</div> : null}
            </section>
            <section className="admin-panel package-result-panel">
              {packageInspection ? (
                <>
                  <div className="package-check"><PackageCheck size={28} /><span>结构检查通过</span></div>
                  <dl>
                    <div><dt>活动名称</dt><dd>{packageInspection.name}</dd></div>
                    <div><dt>活动编号</dt><dd>{packageInspection.eventId}</dd></div>
                    <div><dt>版本</dt><dd>{packageInspection.version}</dd></div>
                    <div><dt>SDK版本</dt><dd>{packageInspection.sdkVersion}</dd></div>
                    <div><dt>入口页面</dt><dd>{packageInspection.entry}</dd></div>
                    <div><dt>文件数量</dt><dd>{packageInspection.fileCount}</dd></div>
                  </dl>
                  <button className="primary-admin-button" onClick={() => { setPackageInspection({ ...packageInspection, status: "published" }); setNotice("本地原型已模拟发布此版本"); }}>
                    {packageInspection.status === "published" ? <><Check size={16} />已模拟发布</> : "模拟发布版本"}
                  </button>
                </>
              ) : (
                <div className="package-empty"><FolderArchive size={34} /><h3>等待活动包</h3><p>检查结果和版本信息会显示在这里。</p></div>
              )}
            </section>
          </div>
        ) : null}
      </section>

      {qrPreview ? (
        <div className="admin-qr-overlay" role="dialog" aria-modal="true" aria-label={`${qrPreview.achievement.name}的二维码`}>
          <div className="admin-qr-dialog">
            <button className="admin-qr-close" onClick={() => setQrPreview(null)} aria-label="关闭二维码"><X size={19} /></button>
            <span className="admin-qr-icon"><QrCode size={20} /></span>
            <p className="panel-kicker">ACHIEVEMENT QR CODE</p>
            <h2>{qrPreview.achievement.name}</h2>
            <small>{config.name} · {qrPreview.achievement.claimCode}</small>
            {/* QR codes are generated in the browser as data URLs, so image optimization does not apply. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrPreview.dataUrl} alt={`${qrPreview.achievement.name}成就二维码`} />
            <code>{qrPreview.claimUrl}</code>
            {qrPreview.localOnly ? <div className="admin-qr-warning">当前二维码包含本机地址，手机无法访问。请使用校园服务器域名或手机能访问的局域网地址打开管理台后，再下载打印。</div> : null}
            <div className="admin-qr-actions">
              <button className="text-admin-button" onClick={() => setQrPreview(null)}>关闭</button>
              <button className="primary-admin-button" onClick={() => downloadQr(qrPreview)}><Download size={15} />下载 PNG</button>
            </div>
          </div>
        </div>
      ) : null}

      {emojiTarget ? (
        <div className="admin-qr-overlay" role="dialog" aria-modal="true" aria-label="选择成就 Emoji 图案">
          <div className="admin-emoji-dialog">
            <button className="admin-qr-close" onClick={() => setEmojiTarget(null)} aria-label="关闭 Emoji 选择"><X size={19} /></button>
            <span className="admin-qr-icon"><SmilePlus size={20} /></span>
            <p className="panel-kicker">EMOJI ICON</p>
            <h2>选择成就图案</h2>
            <p>没有上传图片时，可以使用下面的 Emoji。</p>
            <div className="achievement-emoji-grid">
              {ACHIEVEMENT_EMOJIS.map((emoji) => (
                <button key={emoji} onClick={() => chooseEmoji(emoji)} aria-label={`使用 ${emoji} 作为成就图案`}>{emoji}</button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {selectedEventId && config.eventId === defaultFestivalConfig.eventId ? <button className="admin-reset" onClick={restoreDemoActivity}><RotateCcw size={14} />恢复演示活动配置</button> : null}
      {notice ? <div className="admin-toast"><Check size={15} />{notice}</div> : null}
    </main>
  );
}

function AdminNav({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count?: number }) {
  return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span>{count !== undefined ? <small>{count}</small> : null}</button>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="admin-panel metric-card"><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>;
}

function sectionTitle(section: AdminSection) {
  return {
    overview: "活动总览",
    "new-activity": "新建活动",
    activity: "活动设置",
    achievements: "成就管理",
    categories: "分类管理",
    packages: "活动页面管理",
  }[section];
}

function summaryFromConfig(config: FestivalConfig): FestivalSummary {
  return {
    eventId: config.eventId,
    name: config.name,
    eyebrow: config.eyebrow,
    subtitle: config.subtitle,
    dateLabel: config.dateLabel,
    status: config.status,
    updatedAt: "",
  };
}

function upsertFestivalSummary(current: FestivalSummary[], next: FestivalSummary) {
  const exists = current.some((festival) => festival.eventId === next.eventId);
  return exists
    ? current.map((festival) => festival.eventId === next.eventId ? next : festival)
    : [next, ...current];
}

function detectImageType(bytes: Uint8Array) {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

async function prepareAchievementIcon(file: File) {
  if (file.size > MAX_ICON_FILE_BYTES) throw new Error("图片不能超过 5MB");
  const detectedType = detectImageType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!detectedType) throw new Error("只支持真实的 PNG、JPG/JPEG 或 WebP 图片");
  if (file.type && file.type !== detectedType) throw new Error("图片扩展名与真实格式不一致");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("图片无法读取");
    if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("图片分辨率过大，请先缩小后再上传");

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理这张图片");
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 256, 256);

    const dataUrl = canvas.toDataURL("image/webp", 0.84);
    if (dataUrl.length > MAX_ICON_DATA_URL_LENGTH) throw new Error("压缩后的图片仍然过大，请换一张更简单的图片");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
