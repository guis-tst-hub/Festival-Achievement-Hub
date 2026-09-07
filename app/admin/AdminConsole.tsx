"use client";

import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Boxes,
  CalendarDays,
  Check,
  ChevronRight,
  CirclePlus,
  Download,
  Eye,
  ExternalLink,
  FolderArchive,
  LayoutDashboard,
  PackageCheck,
  QrCode,
  RefreshCw,
  Save,
  Settings2,
  SmilePlus,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { AchievementIconGraphic } from "../components/AchievementIconGraphic";
import {
  FestivalAchievement,
  FestivalConfig,
  defaultAchievementCategory,
  defaultFestivalConfig,
} from "../lib/demo-store";
import { createClientId } from "../lib/client-id";
import { AdminApiError, describeAdminError, readAdminJson } from "../lib/admin-api";

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

type PendingSave = {
  config: FestivalConfig;
  successMessage: string;
};

type ActivityPackageSummary = {
  eventId: string;
  sourceEventId: string;
  name: string;
  version: string;
  entry: string;
  fileCount: number;
  updatedAt: string;
};

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
  const [festivals, setFestivals] = useState<FestivalSummary[]>([]);
  const [festivalDraft, setFestivalDraft] = useState<NewFestivalDraft>(emptyFestivalDraft);
  const [creatingFestival, setCreatingFestival] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [draft, setDraft] = useState(emptyAchievement);
  const [notice, setNotice] = useState("");
  const [claimStats, setClaimStats] = useState<ClaimStat[]>([]);
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const [qrPreview, setQrPreview] = useState<AchievementQrPreview | null>(null);
  const [qrBusyId, setQrBusyId] = useState<string | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<EmojiTarget | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [activityPackage, setActivityPackage] = useState<ActivityPackageSummary | null>(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [packageUploading, setPackageUploading] = useState(false);
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
      const response = await fetch(`/api/admin/claims?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" });
      const payload = await readAdminJson<{ config: FestivalConfig; stats: ClaimStat[] }>(response);
      setConfig(payload.config);
      setPendingSave(null);
      setDraft((current) => ({ ...current, categoryId: "" }));
      setClaimStats(payload.stats);
      setLimitDrafts(Object.fromEntries(payload.config.achievements.map((item) => [item.id, String(item.claimLimit || 100)])));
      setOnlineStatus("online");
      return true;
    } catch (error) {
      setOnlineStatus("error");
      setNotice(describeAdminError(error, "读取活动"));
      return false;
    }
  }

  async function loadFestivalList() {
    try {
      const response = await fetch("/api/admin/festivals", { cache: "no-store" });
      const payload = await readAdminJson<{ festivals: FestivalSummary[] }>(response);
      setFestivals(payload.festivals);
      setOnlineStatus("online");
    } catch (error) {
      setOnlineStatus("error");
      setNotice(describeAdminError(error, "读取活动列表"));
    }
  }

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      void loadFestivalList();
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  async function syncConfigOnline(nextConfig: FestivalConfig, successMessage: string) {
    setOnlineStatus("connecting");
    setPendingSave(null);
    try {
      const response = await fetch("/api/admin/claims", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sync", config: nextConfig }),
      });
      const payload = await readAdminJson<{ config: FestivalConfig; stats: ClaimStat[] }>(response);
      setConfig(payload.config);
      setClaimStats(payload.stats);
      setFestivals((current) => upsertFestivalSummary(current, summaryFromConfig(payload.config)));
      setPendingSave(null);
      setOnlineStatus("online");
      setNotice(successMessage);
      window.setTimeout(() => setNotice((current) => current === successMessage ? "" : current), 2400);
    } catch (error) {
      setOnlineStatus("error");
      setPendingSave({ config: nextConfig, successMessage });
      setNotice(`${describeAdminError(error, "保存")}；当前修改仍保留在页面中`);
    }
  }

  function retryPendingSave() {
    if (!pendingSave || onlineStatus === "connecting") return;
    void syncConfigOnline(pendingSave.config, pendingSave.successMessage);
  }

  async function openActivity(eventId: string) {
    const loaded = await loadOnlineState(eventId);
    if (!loaded) return;
    setQrPreview(null);
    setEmojiTarget(null);
    setActivityPackage(null);
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
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(festivalDraft),
      });
      const payload = await readAdminJson<{ config?: FestivalConfig }>(response);
      if (!payload.config) throw new AdminApiError(502, "INVALID_SERVER_RESPONSE", "missing festival config");

      const newConfig = payload.config;
      setConfig(newConfig);
      setPendingSave(null);
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
      setNotice(describeAdminError(error, "创建活动"));
    } finally {
      setCreatingFestival(false);
    }
  }

  function persist(nextConfig: FestivalConfig, message = "更改已保存") {
    if (onlineStatus === "connecting") {
      setNotice("[SAVE_IN_PROGRESS] 上一次操作仍在保存，请稍候");
      return false;
    }
    setConfig(nextConfig);
    setNotice("正在保存…");
    void syncConfigOnline(nextConfig, message);
    return true;
  }

  function toggleEventStatus() {
    persist(
      { ...config, status: config.status === "active" ? "closed" : "active" },
      config.status === "active" ? "活动已关闭" : "活动已开启",
    );
  }

  function addCategory(event: FormEvent) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) {
      setNotice("[CATEGORY_NAME_REQUIRED] 请输入分类名称");
      return;
    }
    const id = createClientId("category-");
    const started = persist({
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
    if (started) setCategoryName("");
  }

  function removeCategory(categoryId: string) {
    if (config.achievements.some((achievement) => achievement.categoryId === categoryId)) {
      setNotice("[CATEGORY_IN_USE] 这个分类仍有成就，请先移动成就");
      return;
    }
    persist({
      ...config,
      categories: config.categories.filter((category) => category.id !== categoryId),
    }, "空分类已移除");
  }

  function addAchievement(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.claimCode.trim()) {
      setNotice("[ACHIEVEMENT_REQUIRED_FIELDS] 请填写名称和识别码");
      return;
    }
    if (config.achievements.some((item) => item.claimCode === draft.claimCode.trim())) {
      setNotice("[CLAIM_CODE_DUPLICATE] 识别码不能重复");
      return;
    }
    const nextAchievement: FestivalAchievement = {
      ...draft,
      id: createClientId("ach_"),
      name: draft.name.trim(),
      claimCode: draft.claimCode.trim(),
      description: draft.description.trim() || "等待补充成就说明",
      sortOrder: config.achievements.length * 10 + 10,
    };
    const started = persist({ ...config, achievements: [...config.achievements, nextAchievement] }, "新成就已加入");
    if (started) setDraft({ ...emptyAchievement, categoryId: "" });
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
      setNotice("[CLAIM_LIMIT_INVALID] 领取上限必须是 1 到 100000 的整数");
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
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reset", eventId: config.eventId, achievementId }),
      });
      const payload = await readAdminJson<{ stats: ClaimStat[] }>(response);
      setClaimStats(payload.stats);
      setNotice("该成就的在线领取计数已清零");
      setOnlineStatus("online");
    } catch (error) {
      setNotice(describeAdminError(error, "重置领取计数"));
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
      setNotice("[QR_GENERATION_FAILED] 二维码生成失败，请稍后重试");
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
      setNotice("[QR_DOWNLOAD_FAILED] 二维码下载失败，请稍后重试");
    } finally {
      setQrBusyId(null);
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

  async function loadActivityPackage(eventId: string) {
    setPackageLoading(true);
    try {
      const response = await fetch(`/api/admin/activity-package?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" });
      const payload = await readAdminJson<{ package: ActivityPackageSummary | null }>(response);
      setActivityPackage(payload.package);
      setOnlineStatus("online");
    } catch (error) {
      setOnlineStatus("error");
      setNotice(describeAdminError(error, "读取活动包"));
    } finally {
      setPackageLoading(false);
    }
  }

  function openPackageManager() {
    if (!selectedEventId) return;
    setSection("packages");
    void loadActivityPackage(selectedEventId);
  }

  async function uploadActivityPackage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedEventId || packageUploading) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setNotice("[PACKAGE_INVALID] 活动包必须是 ZIP 文件");
      return;
    }

    setPackageUploading(true);
    setOnlineStatus("connecting");
    setNotice("正在检查并导入活动包…");
    try {
      const form = new FormData();
      form.set("eventId", selectedEventId);
      form.set("package", file);
      const response = await fetch("/api/admin/activity-package", {
        method: "POST",
        cache: "no-store",
        body: form,
      });
      const payload = await readAdminJson<{ config: FestivalConfig; stats: ClaimStat[]; summary: ActivityPackageSummary }>(response);
      setConfig(payload.config);
      setClaimStats(payload.stats);
      setLimitDrafts(Object.fromEntries(payload.config.achievements.map((item) => [item.id, String(item.claimLimit || 100)])));
      setActivityPackage(payload.summary);
      setFestivals((current) => upsertFestivalSummary(current, summaryFromConfig(payload.config)));
      setPendingSave(null);
      setOnlineStatus("online");
      setNotice(`活动包 ${payload.summary.version} 已导入并启用`);
    } catch (error) {
      setOnlineStatus("error");
      setNotice(describeAdminError(error, "导入活动包"));
    } finally {
      setPackageUploading(false);
    }
  }

  async function removeActivityPackage() {
    if (!selectedEventId || !activityPackage || packageUploading) return;
    if (!window.confirm("移除自定义活动包并恢复平台默认活动页面？成就和分类数据会保留。")) return;
    setPackageUploading(true);
    setOnlineStatus("connecting");
    try {
      const response = await fetch(`/api/admin/activity-package?eventId=${encodeURIComponent(selectedEventId)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      await readAdminJson<{ removed: true }>(response);
      setActivityPackage(null);
      setOnlineStatus("online");
      setNotice("自定义活动包已移除，访客页面已恢复默认界面");
    } catch (error) {
      setOnlineStatus("error");
      setNotice(describeAdminError(error, "移除活动包"));
    } finally {
      setPackageUploading(false);
    }
  }

  return (
    <main className="admin-shell">
      <div className="admin-mobile-guard">
        <Settings2 size={28} />
        <h1>请在电脑上打开管理台</h1>
        <p>管理员页面按照电脑比例设计，手机端只提供活动体验。</p>
        <Link href="/"><ArrowLeft size={15} />返回活动页</Link>
      </div>

      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/">
          <span>N</span>
          <div><strong>NCPA</strong><small>FESTIVAL ACHIEVEMENT HUB</small></div>
        </Link>
        <nav>
          <AdminNav active={section === "overview"} onClick={returnToOverview} icon={<LayoutDashboard size={18} />} label="活动总览" />
          {!selectedEventId ? <AdminNav active={section === "new-activity"} onClick={showNewActivity} icon={<CirclePlus size={18} />} label="新建活动" /> : null}
          {selectedEventId ? (
            <>
              <div className="admin-nav-context"><span>当前活动</span><strong>{config.name}</strong><small>{config.eventId}</small></div>
              <AdminNav active={section === "activity"} onClick={() => setSection("activity")} icon={<CalendarDays size={18} />} label="活动设置" />
              <AdminNav active={section === "achievements"} onClick={() => setSection("achievements")} icon={<Sparkles size={18} />} label="成就管理" count={config.achievements.length} />
              <AdminNav active={section === "categories"} onClick={() => setSection("categories")} icon={<Boxes size={18} />} label="分类管理" count={config.categories.length} />
              <AdminNav active={section === "packages"} onClick={openPackageManager} icon={<FolderArchive size={18} />} label="活动包管理" />
            </>
          ) : null}
        </nav>
        <div className="admin-sidebar-footer">
          <span>服务器管理模式</span>
          <p>配置与领取计数由数据库持久化</p>
          <Link href="/"><ArrowLeft size={14} />查看手机页面</Link>
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
              {!festivals.length ? <div className="admin-panel activity-empty"><CalendarDays size={28} /><h3>暂无活动</h3><p>创建第一个活动后，它会显示在这里。</p></div> : null}
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
                <li><span>03</span><div><strong>生成二维码</strong><small>下载并测试每个成就的二维码。</small></div></li>
                <li><span>04</span><div><strong>检查后开放</strong><small>确认二维码和页面无误后再开启活动。</small></div></li>
              </ol>
            </aside>
          </div>
        ) : null}

        {section === "activity" ? (
          <div className="admin-content">
            <div className="prototype-banner"><Sparkles size={18} /><div><strong>正在管理：{config.name}</strong><p>下面的分类、成就和领取数量都只属于该活动；管理请求由服务器认证并执行运行时校验。</p></div></div>
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
                        <small>{achievement.claimCode} · {config.categories.find((category) => category.id === achievement.categoryId)?.name ?? defaultAchievementCategory.name}</small>
                        <div className="admin-icon-controls">
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
                  <small>使用内置 Emoji，避免将大型二进制内容写入数据库。</small>
                  <div className="new-achievement-icon-actions">
                    <button type="button" onClick={() => setEmojiTarget({ kind: "draft" })}><SmilePlus size={13} />选择 Emoji</button>
                  </div>
                </div>
              </div>
              <label>
                所属分类（可选）
                <select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
                  <option value="">{defaultAchievementCategory.name}（不选择分类）</option>
                  {config.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
                </select>
                <small>不选择时，成就会自动显示在默认分类中。</small>
              </label>
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
              <article className="admin-panel default-category-card">
                <span className="category-index">默认</span>
                <h3>{defaultAchievementCategory.name}</h3>
                <p>{defaultAchievementCategory.description}</p>
                <div><span>{config.achievements.filter((achievement) => !achievement.categoryId).length} 个成就</span><small>系统分组</small></div>
              </article>
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
              <h2>导入活动包</h2>
              <p>选择 ZIP 后，服务器会检查 <code>manifest.json</code>、<code>festival-config.json</code> 和入口页面，再保存到数据库。</p>
              <label className="package-dropzone" aria-disabled={packageUploading}>
                <input type="file" accept="application/zip,.zip" disabled={packageUploading} onChange={(event) => void uploadActivityPackage(event)} />
                {packageUploading ? <span className="spinner" /> : <UploadCloud size={30} />}
                <strong>{packageUploading ? "正在导入，请稍候" : activityPackage ? "选择新 ZIP 替换当前活动包" : "选择 ZIP 活动包"}</strong>
                <small>最大 8 MB；导入会同步包内的分类与成就</small>
              </label>
              <div className="package-guidance">
                <strong>导入规则</strong>
                <p>当前活动编号和开放状态不会被覆盖。包内网页会在隔离环境运行，扫码仍由平台统一校验。</p>
              </div>
            </section>

            <section className="admin-panel package-result-panel">
              {packageLoading ? (
                <div className="package-empty"><span className="spinner" /><h3>正在读取活动包</h3></div>
              ) : activityPackage ? (
                <>
                  <div className="package-check"><PackageCheck size={28} /><span>当前活动包已启用</span></div>
                  <dl>
                    <div><dt>包内活动名称</dt><dd>{activityPackage.name}</dd></div>
                    <div><dt>来源活动编号</dt><dd>{activityPackage.sourceEventId}</dd></div>
                    <div><dt>版本</dt><dd>{activityPackage.version}</dd></div>
                    <div><dt>入口页面</dt><dd>{activityPackage.entry}</dd></div>
                    <div><dt>文件数量</dt><dd>{activityPackage.fileCount}</dd></div>
                    <div><dt>最后导入</dt><dd>{new Date(activityPackage.updatedAt).toLocaleString("zh-CN")}</dd></div>
                  </dl>
                  <div className="package-actions">
                    <Link className="primary-admin-button" href={`/?event=${encodeURIComponent(config.eventId)}`} target="_blank"><ExternalLink size={15} />打开活动页面</Link>
                    <button className="text-admin-button package-remove-button" type="button" disabled={packageUploading} onClick={() => void removeActivityPackage()}><Trash2 size={15} />移除活动包</button>
                  </div>
                </>
              ) : (
                <div className="package-empty"><FolderArchive size={34} /><h3>尚未导入活动包</h3><p>当前访客看到的是平台默认活动页面。</p></div>
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

      {notice ? (
        <div className={pendingSave ? "admin-toast is-error" : "admin-toast"} role="status">
          {pendingSave ? <AlertTriangle size={15} /> : <Check size={15} />}
          <span>{notice}</span>
          {pendingSave ? (
            <button type="button" onClick={retryPendingSave} disabled={onlineStatus === "connecting"}>
              <RefreshCw size={13} />{onlineStatus === "connecting" ? "重试中" : "重新保存"}
            </button>
          ) : null}
        </div>
      ) : null}
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
    packages: "活动包管理",
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
