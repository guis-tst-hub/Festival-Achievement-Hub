"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- plain links avoid a vinext dev-runtime duplicate React issue */

import {
  Archive,
  ArrowLeft,
  Boxes,
  Check,
  ChevronRight,
  CirclePlus,
  FolderArchive,
  LayoutDashboard,
  PackageCheck,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import JSZip from "jszip";
import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  FestivalAchievement,
  FestivalConfig,
  defaultFestivalConfig,
  loadFestivalConfig,
  resetDemoData,
  saveFestivalConfig,
} from "../lib/demo-store";

type AdminSection = "overview" | "achievements" | "categories" | "packages";

type PackageInspection = {
  fileName: string;
  eventId: string;
  name: string;
  version: string;
  entry: string;
  fileCount: number;
  status: "ready" | "published";
};

const emptyAchievement: Omit<FestivalAchievement, "id"> = {
  claimCode: "",
  name: "",
  description: "",
  icon: "✦",
  categoryId: "",
  enabled: true,
  sortOrder: 10,
};

export function AdminConsole() {
  const [config, setConfig] = useState<FestivalConfig>(defaultFestivalConfig);
  const [section, setSection] = useState<AdminSection>("overview");
  const [categoryName, setCategoryName] = useState("");
  const [draft, setDraft] = useState(emptyAchievement);
  const [packageInspection, setPackageInspection] = useState<PackageInspection | null>(null);
  const [packageError, setPackageError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const loaded = loadFestivalConfig();
      setConfig(loaded);
      setDraft((current) => ({
        ...current,
        categoryId: loaded.categories[0]?.id ?? "",
      }));
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  const activeAchievements = useMemo(
    () => config.achievements.filter((achievement) => achievement.enabled).length,
    [config.achievements],
  );

  function persist(nextConfig: FestivalConfig, message = "更改已保存到本地测试数据") {
    setConfig(nextConfig);
    saveFestivalConfig(nextConfig);
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
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
      if (!eventId || !String(manifest.version ?? "")) throw new Error("manifest缺少eventId或version");
      if (!zip.file(entry)) throw new Error(`找不到入口页面：${entry}`);

      setPackageInspection({
        fileName: file.name,
        eventId,
        name: String(manifest.name ?? eventId),
        version: String(manifest.version),
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
    zip.file("index.html", `<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${config.name}</title>\n  <link rel="stylesheet" href="assets/theme.css">\n</head>\n<body>\n  <main><p>ACTIVITY PACKAGE</p><h1>${config.name}</h1><p>这里替换为独立节日页面。</p></main>\n</body>\n</html>`);
    zip.file("assets/theme.css", "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111018;color:#f7d889;font-family:system-ui;text-align:center}main{padding:3rem}");
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
          <span>☾</span>
          <div><strong>夜巡管理台</strong><small>LOCAL PROTOTYPE</small></div>
        </a>
        <nav>
          <AdminNav active={section === "overview"} onClick={() => setSection("overview")} icon={<LayoutDashboard size={18} />} label="总览" />
          <AdminNav active={section === "achievements"} onClick={() => setSection("achievements")} icon={<Sparkles size={18} />} label="成就管理" count={config.achievements.length} />
          <AdminNav active={section === "categories"} onClick={() => setSection("categories")} icon={<Boxes size={18} />} label="分类管理" count={config.categories.length} />
          <AdminNav active={section === "packages"} onClick={() => setSection("packages")} icon={<FolderArchive size={18} />} label="活动包" />
        </nav>
        <div className="admin-sidebar-footer">
          <span>本地测试模式</span>
          <p>数据只保存在当前浏览器</p>
          <a href="/"><ArrowLeft size={14} />查看手机页面</a>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><span>{config.eyebrow}</span><h1>{sectionTitle(section)}</h1></div>
          <div className="admin-status"><span className={config.status} />{config.status === "active" ? "活动已开放" : "活动已关闭"}</div>
        </header>

        {section === "overview" ? (
          <div className="admin-content">
            <div className="prototype-banner"><Sparkles size={18} /><div><strong>这是本地交互原型</strong><p>用于确认页面、管理流程和二维码解锁；服务器账号、数据库和Docker会在后续接入。</p></div></div>
            <div className="metric-grid">
              <Metric label="成就总数" value={String(config.achievements.length)} detail={`${activeAchievements} 个正在启用`} />
              <Metric label="成就分类" value={String(config.categories.length)} detail="按当前节日独立管理" />
              <Metric label="活动页面" value="1" detail="默认主题 · 本地版本" />
            </div>
            <div className="admin-panel event-control">
              <div><span className="panel-kicker">CURRENT EVENT</span><h2>{config.name}</h2><p>{config.subtitle}</p></div>
              <button className={config.status === "active" ? "danger-button" : "primary-admin-button"} onClick={toggleEventStatus}>
                {config.status === "active" ? "关闭活动" : "开启活动"}
              </button>
            </div>
            <div className="admin-panel quick-links">
              <button onClick={() => setSection("achievements")}><Sparkles size={19} /><span><strong>添加新成就</strong><small>设置名称、分类与识别码</small></span><ChevronRight size={18} /></button>
              <button onClick={() => setSection("packages")}><UploadCloud size={19} /><span><strong>检查活动包</strong><small>上传ZIP并核对目录结构</small></span><ChevronRight size={18} /></button>
            </div>
          </div>
        ) : null}

        {section === "achievements" ? (
          <div className="admin-content split-content">
            <section className="admin-panel achievement-list-panel">
              <div className="panel-heading"><div><span className="panel-kicker">ACHIEVEMENTS</span><h2>当前成就</h2></div><span>{config.achievements.length}项</span></div>
              <div className="admin-achievement-list">
                {config.achievements.map((achievement) => (
                  <article key={achievement.id} className={!achievement.enabled ? "is-disabled" : ""}>
                    <span className="admin-achievement-icon">{achievement.icon}</span>
                    <div><strong>{achievement.name}</strong><small>{achievement.claimCode}</small></div>
                    <span>{config.categories.find((category) => category.id === achievement.categoryId)?.name ?? "未分组"}</span>
                    <button onClick={() => toggleAchievement(achievement.id)}>{achievement.enabled ? "停用" : "启用"}</button>
                  </article>
                ))}
              </div>
            </section>
            <form className="admin-panel create-form" onSubmit={addAchievement}>
              <div className="panel-heading"><div><span className="panel-kicker">NEW RECORD</span><h2>新增成就</h2></div><CirclePlus size={20} /></div>
              <label>成就名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：钟楼见证人" /></label>
              <label>二维码识别码<input value={draft.claimCode} onChange={(event) => setDraft({ ...draft, claimCode: event.target.value })} placeholder="bell-tower-01" /></label>
              <label>成就说明<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="写下解锁条件或发现内容" /></label>
              <div className="form-row">
                <label>图标<input value={draft.icon} maxLength={3} onChange={(event) => setDraft({ ...draft, icon: event.target.value })} /></label>
                <label>所属分类<select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>{config.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
              </div>
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
              <h2>上传活动包</h2>
              <p>活动包使用ZIP格式，根目录必须包含manifest.json和入口HTML。</p>
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

      <button className="admin-reset" onClick={() => { resetDemoData(); const clean = loadFestivalConfig(); setConfig(clean); setDraft({ ...emptyAchievement, categoryId: clean.categories[0]?.id ?? "" }); setNotice("本地测试数据已重置"); }}><RotateCcw size={14} />重置测试数据</button>
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
    achievements: "成就管理",
    categories: "分类管理",
    packages: "活动包管理",
  }[section];
}
