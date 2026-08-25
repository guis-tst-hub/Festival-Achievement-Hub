"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  FlaskConical,
  LockKeyhole,
  QrCode,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { CSSProperties, ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CONFIG_CHANGED_EVENT,
  FestivalAchievement,
  FestivalConfig,
  UnlockState,
  defaultFestivalConfig,
  loadFestivalConfig,
  loadUnlockState,
  saveUnlockState,
} from "../lib/demo-store";

type ClaimResult = {
  kind: "success" | "already" | "error";
  title: string;
  message: string;
  achievement?: FestivalAchievement;
};

function buildClaimUrl(origin: string, eventId: string, claimCode: string) {
  const url = new URL(origin);
  url.searchParams.set("event", eventId);
  url.searchParams.set("unlock", claimCode);
  return url.toString();
}

async function decodeQrImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxDimension = 1800;
  const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    bitmap.close();
    throw new Error("当前浏览器无法读取图片画布");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const imageData = context.getImageData(0, 0, width, height);
  const decoded = jsQR(imageData.data, width, height, {
    inversionAttempts: "attemptBoth",
  });

  if (!decoded?.data) throw new Error("图片中没有识别到清晰的二维码");
  return decoded.data;
}

export function FestivalExperience() {
  const [config, setConfig] = useState<FestivalConfig>(defaultFestivalConfig);
  const [unlockState, setUnlockState] = useState<UnlockState>({ version: 1, unlocked: {} });
  const [hydrated, setHydrated] = useState(false);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [decodeError, setDecodeError] = useState("");
  const [sampleQr, setSampleQr] = useState("");
  const [manualCode, setManualCode] = useState("");
  const processedUrl = useRef(false);

  useEffect(() => {
    const syncConfig = () => {
      const nextConfig = loadFestivalConfig();
      setConfig(nextConfig);
      setUnlockState(loadUnlockState(nextConfig.eventId));
    };

    const hydrationTimer = window.setTimeout(() => {
      syncConfig();
      setHydrated(true);
    }, 0);
    window.addEventListener(CONFIG_CHANGED_EVENT, syncConfig);
    window.addEventListener("storage", syncConfig);
    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener(CONFIG_CHANGED_EVENT, syncConfig);
      window.removeEventListener("storage", syncConfig);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || processedUrl.current) return;
    processedUrl.current = true;
    const params = new URLSearchParams(window.location.search);
    const claimCode = params.get("unlock");
    if (!claimCode) return;
    claimAchievement(params.get("event") ?? config.eventId, claimCode);
    window.history.replaceState({}, "", window.location.pathname);
  // This URL claim should run only once after browser state has hydrated.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, config.eventId]);

  const activeAchievements = useMemo(
    () => config.achievements.filter((achievement) => achievement.enabled),
    [config.achievements],
  );
  const unlockedCount = activeAchievements.filter(
    (achievement) => unlockState.unlocked[achievement.id],
  ).length;
  const progress = activeAchievements.length
    ? Math.round((unlockedCount / activeAchievements.length) * 100)
    : 0;
  const sampleAchievement = activeAchievements.find(
    (achievement) => achievement.id === "ach_ghost_room",
  ) ?? activeAchievements[0];

  useEffect(() => {
    if (!hydrated || !sampleAchievement) return;
    const claimUrl = buildClaimUrl(
      window.location.origin,
      config.eventId,
      sampleAchievement.claimCode,
    );
    QRCode.toDataURL(claimUrl, {
      width: 480,
      margin: 2,
      color: { dark: "#17131f", light: "#fff8df" },
      errorCorrectionLevel: "M",
    }).then(setSampleQr);
  }, [config.eventId, hydrated, sampleAchievement]);

  function claimAchievement(eventId: string, claimCode: string) {
    if (config.status !== "active") {
      setClaimResult({
        kind: "error",
        title: "活动还在沉睡",
        message: "当前没有开放的节日活动，请在活动期间再次尝试。",
      });
      return;
    }

    if (eventId !== config.eventId) {
      setClaimResult({
        kind: "error",
        title: "不是今夜的暗号",
        message: "这个二维码属于另一个节日，它目前没有开放。",
      });
      return;
    }

    const achievement = config.achievements.find(
      (item) => item.claimCode === claimCode,
    );

    if (!achievement) {
      setClaimResult({
        kind: "error",
        title: "没有找到这份档案",
        message: "二维码内容无法识别，请确认图片完整、清晰且属于本活动。",
      });
      return;
    }

    if (!achievement.enabled) {
      setClaimResult({
        kind: "error",
        title: "档案暂时封存",
        message: "这个成就当前不可领取。",
      });
      return;
    }

    if (unlockState.unlocked[achievement.id]) {
      setClaimResult({
        kind: "already",
        title: "你已经发现过它",
        message: "这枚印记已经收藏在你的夜巡档案中。",
        achievement,
      });
      return;
    }

    const nextState: UnlockState = {
      version: 1,
      unlocked: {
        ...unlockState.unlocked,
        [achievement.id]: {
          unlockedAt: new Date().toISOString(),
          source: "qr",
        },
      },
    };
    setUnlockState(nextState);
    saveUnlockState(config.eventId, nextState);
    setClaimResult({
      kind: "success",
      title: "新成就已解锁",
      message: achievement.description,
      achievement,
    });
  }

  function claimFromPayload(payload: string) {
    const trimmed = payload.trim();
    if (!trimmed) throw new Error("二维码内容为空");

    try {
      const url = new URL(trimmed, window.location.origin);
      const claimCode = url.searchParams.get("unlock");
      if (!claimCode) throw new Error("二维码中缺少成就识别码");
      claimAchievement(url.searchParams.get("event") ?? config.eventId, claimCode);
    } catch (error) {
      if (/^[a-z0-9_-]+$/i.test(trimmed)) {
        claimAchievement(config.eventId, trimmed);
        return;
      }
      throw error;
    }
  }

  async function handleQrFile(file?: File) {
    if (!file) return;
    setIsDecoding(true);
    setDecodeError("");
    try {
      const payload = await decodeQrImage(file);
      claimFromPayload(payload);
    } catch (error) {
      setDecodeError(error instanceof Error ? error.message : "二维码识别失败");
    } finally {
      setIsDecoding(false);
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    void handleQrFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void handleQrFile(event.dataTransfer.files?.[0]);
  }

  function clearProgress() {
    const empty: UnlockState = { version: 1, unlocked: {} };
    setUnlockState(empty);
    saveUnlockState(config.eventId, empty);
    setClaimResult(null);
    setDecodeError("");
  }

  return (
    <main className="festival-stage">
      <section className="phone-shell" aria-label="节日成就手机页面预览">
        <div className="phone-grain" aria-hidden="true" />
        {config.status === "closed" ? (
          <ClosedFestival config={config} />
        ) : (
          <div className="festival-scroll">
            <header className="festival-header">
              <div>
                <p className="festival-eyebrow">{config.eyebrow}</p>
                <h1>{config.name}</h1>
              </div>
              <div className="live-badge"><span />活动中</div>
            </header>

            <section className="hero-card">
              <div className="hero-moon" aria-hidden="true"><span /></div>
              <p className="hero-date">{config.dateLabel}</p>
              <h2>今夜，校园会记住<br />每一个发现秘密的人。</h2>
              <p>{config.subtitle}</p>
              <a className="hero-link" href="#achievements">
                查看夜巡档案 <ArrowRight size={16} />
              </a>
            </section>

            <section className="progress-card" aria-label={`已解锁${unlockedCount}个，共${activeAchievements.length}个`}>
              <div className="progress-copy">
                <span className="section-kicker">收集进度</span>
                <strong>{unlockedCount}<small> / {activeAchievements.length}</small></strong>
                <p>{progress === 100 ? "所有档案已归位" : "继续寻找散落在校园里的印记"}</p>
              </div>
              <div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}>
                <span>{progress}%</span>
              </div>
            </section>

            <section className="achievement-section" id="achievements">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">个人收藏</span>
                  <h2>夜巡成就</h2>
                </div>
                <Sparkles size={20} aria-hidden="true" />
              </div>

              {config.categories
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((category) => {
                  const items = activeAchievements
                    .filter((achievement) => achievement.categoryId === category.id)
                    .sort((a, b) => a.sortOrder - b.sortOrder);
                  if (!items.length) return null;
                  return (
                    <div className="category-block" key={category.id}>
                      <div className="category-title">
                        <h3>{category.name}</h3>
                        <span>{items.filter((item) => unlockState.unlocked[item.id]).length}/{items.length}</span>
                      </div>
                      <p className="category-description">{category.description}</p>
                      <div className="achievement-grid">
                        {items.map((achievement) => {
                          const record = unlockState.unlocked[achievement.id];
                          return (
                            <article className={`achievement-card ${record ? "is-unlocked" : "is-locked"}`} key={achievement.id}>
                              <div className="achievement-icon" aria-hidden="true">
                                {record ? achievement.icon : <LockKeyhole size={21} />}
                              </div>
                              <div>
                                <h4>{achievement.hidden && !record ? "未知档案" : achievement.name}</h4>
                                <p>{achievement.hidden && !record ? "完成特殊条件后揭晓" : achievement.description}</p>
                                <span className="achievement-state">
                                  {record ? <><Check size={12} /> 已解锁</> : "尚未发现"}
                                </span>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </section>

            <footer className="festival-footer">
              <span>所有记录仅保存在当前浏览器</span>
              <a href="/admin">管理入口</a>
            </footer>
          </div>
        )}

        {claimResult ? (
          <div className="claim-overlay" role="dialog" aria-modal="true" aria-label={claimResult.title}>
            <button className="overlay-close" onClick={() => setClaimResult(null)} aria-label="关闭提示"><X size={20} /></button>
            <div className={`claim-seal ${claimResult.kind}`}>
              {claimResult.achievement?.icon ?? (claimResult.kind === "error" ? "!" : "✓")}
            </div>
            <span className="claim-kicker">
              {claimResult.kind === "success" ? "ARCHIVE UNLOCKED" : claimResult.kind === "already" ? "ALREADY FOUND" : "SCAN NOTICE"}
            </span>
            <h2>{claimResult.title}</h2>
            {claimResult.achievement ? <h3>{claimResult.achievement.name}</h3> : null}
            <p>{claimResult.message}</p>
            <button className="primary-button" onClick={() => setClaimResult(null)}>返回档案</button>
          </div>
        ) : null}
      </section>

      <aside className="desktop-lab" aria-label="电脑二维码测试工具">
        <div className="lab-heading">
          <span className="lab-icon"><FlaskConical size={19} /></span>
          <div><small>LOCAL TEST LAB</small><h2>二维码测试台</h2></div>
        </div>
        <p className="lab-intro">网页保持手机比例。把二维码截图拖到这里，即可模拟手机扫码解锁。</p>

        <label className={`qr-dropzone ${isDecoding ? "is-loading" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileInput} />
          <span className="drop-icon">{isDecoding ? <span className="spinner" /> : <Upload size={24} />}</span>
          <strong>{isDecoding ? "正在辨认暗号…" : "上传二维码图片"}</strong>
          <small>支持 PNG、JPG、WebP，也可以拖放</small>
        </label>
        {decodeError ? <div className="lab-error"><AlertTriangle size={15} />{decodeError}</div> : null}

        <div className="manual-claim">
          <label htmlFor="manual-code">或输入识别码</label>
          <div>
            <input id="manual-code" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="ghost-room-8f32" />
            <button onClick={() => { try { claimFromPayload(manualCode); setDecodeError(""); } catch (error) { setDecodeError(error instanceof Error ? error.message : "识别失败"); } }} aria-label="提交识别码"><ArrowRight size={17} /></button>
          </div>
        </div>

        <div className="sample-qr-card">
          <div className="sample-copy">
            <span><QrCode size={16} />测试二维码</span>
            <strong>{sampleAchievement?.name ?? "暂无成就"}</strong>
            <small>下载后重新上传，检查完整解锁流程。</small>
          </div>
          {/* The QR code is generated in-browser as a data URL, so image optimization does not apply. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {sampleQr ? <img src={sampleQr} alt={`${sampleAchievement?.name ?? "测试"}二维码`} /> : null}
          {sampleQr ? <a href={sampleQr} download={`${sampleAchievement?.claimCode ?? "test-qr"}.png`}><Download size={14} />下载图片</a> : null}
        </div>

        <div className="lab-actions">
          <button onClick={clearProgress}><RotateCcw size={14} />清空解锁进度</button>
          <a href="/admin">打开本地管理台 <ArrowRight size={14} /></a>
        </div>
        <p className="lab-note">测试数据保存在这台电脑的浏览器中，不会上传。</p>
      </aside>
    </main>
  );
}

function ClosedFestival({ config }: { config: FestivalConfig }) {
  return (
    <div className="closed-festival">
      <div className="closed-orbit" aria-hidden="true"><span /></div>
      <span className="festival-eyebrow">{config.eyebrow}</span>
      <p className="closed-code">THE ARCHIVE IS ASLEEP</p>
      <h1>活动暂未开放</h1>
      <p>校园里的秘密还没有苏醒。请在活动期间，再次扫描墙上的二维码。</p>
      <a href="/admin">管理员入口</a>
    </div>
  );
}
