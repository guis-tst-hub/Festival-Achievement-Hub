"use client";

import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  LockKeyhole,
  QrCode,
  X,
} from "lucide-react";
import jsQR from "jsqr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AchievementIconGraphic } from "./AchievementIconGraphic";
import {
  FestivalAchievement,
  FestivalConfig,
  UnlockState,
  loadUnlockState,
  saveUnlockState,
} from "../lib/demo-store";

type ClaimedAchievement = Pick<FestivalAchievement, "id" | "name" | "description" | "icon">;

type ClaimResult = {
  kind: "success" | "already" | "error";
  title: string;
  message: string;
  achievement?: ClaimedAchievement;
};

type OnlineClaimResponse = {
  status: "claimed" | "already" | "event_closed" | "achievement_disabled" | "limit_reached" | "not_found";
  achievement?: ClaimedAchievement;
  claimedCount?: number;
  maxClaims?: number;
  error?: string;
};

type ScannerStatus = "starting" | "scanning" | "verifying" | "unavailable" | "error";

const inactiveFestivalConfig: FestivalConfig = {
  eventId: "",
  name: "",
  eyebrow: "",
  subtitle: "",
  dateLabel: "",
  status: "closed",
  categories: [],
  achievements: [],
};

export function FestivalExperience() {
  const [config, setConfig] = useState<FestivalConfig>(inactiveFestivalConfig);
  const [unlockState, setUnlockState] = useState<UnlockState>({ version: 1, unlocked: {} });
  const [hydrated, setHydrated] = useState(false);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus>("starting");
  const [scannerMessage, setScannerMessage] = useState("");
  const processedUrl = useRef(false);
  const scannerVideo = useRef<HTMLVideoElement>(null);
  const scannerCanvas = useRef<HTMLCanvasElement>(null);
  const scannerStream = useRef<MediaStream | null>(null);
  const scannerFrame = useRef<number | null>(null);
  const scannerLocked = useRef(false);
  const lastScannerRead = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const syncConfig = async () => {
      const requestedEvent = new URLSearchParams(window.location.search).get("event");
      const endpoint = requestedEvent
        ? `/api/festival?eventId=${encodeURIComponent(requestedEvent)}`
        : "/api/festival";
      try {
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error("活动读取失败");
        const payload = await response.json() as { config: FestivalConfig | null };
        if (cancelled) return;
        const nextConfig = payload.config?.status === "active" ? payload.config : inactiveFestivalConfig;
        setConfig(nextConfig);
        setUnlockState(nextConfig.status === "active" ? loadUnlockState(nextConfig.eventId) : { version: 1, unlocked: {} });
        if (nextConfig.status === "closed") {
          setClaimResult(null);
          setScannerOpen(false);
        }
      } catch {
        if (!cancelled) {
          setConfig(inactiveFestivalConfig);
          setUnlockState({ version: 1, unlocked: {} });
          setClaimResult(null);
          setScannerOpen(false);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };

    const hydrationTimer = window.setTimeout(() => {
      void syncConfig();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(hydrationTimer);
    };
  }, []);

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
  const claimAchievement = useCallback(async (eventId: string, claimCode: string) => {
    try {
      const response = await fetch("/api/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, claimCode }),
      });
      const result = await response.json() as OnlineClaimResponse;
      const isStructuredNotFound = response.status === 404 && result.status === "not_found";
      if (!response.ok && !isStructuredNotFound) {
        throw new Error(response.status === 429 ? "操作过于频繁，请一分钟后再试。" : "服务器暂时无法完成校验，请稍后重试。");
      }
      const localAchievement = config.achievements.find((item) => item.claimCode === claimCode);
      const achievement = result.achievement ?? localAchievement;

      if (result.status === "claimed" || result.status === "already") {
        if (!achievement) throw new Error("服务器返回的成就资料不完整");
        setUnlockState((current) => {
          const nextState: UnlockState = {
            version: 1,
            unlocked: {
              ...current.unlocked,
              [achievement.id]: {
                unlockedAt: current.unlocked[achievement.id]?.unlockedAt ?? new Date().toISOString(),
                source: "qr",
              },
            },
          };
          saveUnlockState(eventId, nextState);
          return nextState;
        });
        const quota = result.claimedCount !== undefined && result.maxClaims !== undefined
          ? `当前已领取 ${result.claimedCount}/${result.maxClaims}。`
          : "";
        setClaimResult({
          kind: result.status === "claimed" ? "success" : "already",
          title: result.status === "claimed" ? "新成就已解锁" : "你已经获得此成就",
          message: `${achievement.description}${quota ? ` ${quota}` : ""}`,
          achievement,
        });
        return;
      }

      const errors: Record<OnlineClaimResponse["status"], { title: string; message: string }> = {
        claimed: { title: "领取成功", message: "" },
        already: { title: "已经领取", message: "" },
        event_closed: { title: "活动未开放", message: "该二维码对应的活动当前未开放。" },
        achievement_disabled: { title: "成就已停用", message: "该成就当前不可领取。" },
        limit_reached: { title: "领取名额已满", message: `这枚成就的 ${result.maxClaims ?? "全部"} 个名额已经领完。` },
        not_found: { title: "无法识别此二维码", message: "二维码不属于当前活动或识别码无效。" },
      };
      setClaimResult({ kind: "error", ...errors[result.status] });
    } catch (error) {
      setClaimResult({
        kind: "error",
        title: "暂时无法在线校验",
        message: error instanceof Error ? error.message : "请确认设备已连接校园网络后重试。",
      });
    }
  }, [config]);

  const claimFromPayload = useCallback(async (payload: string) => {
    const trimmed = payload.trim();
    if (!trimmed) throw new Error("二维码内容为空");

    try {
      const url = new URL(trimmed, window.location.origin);
      const claimCode = url.searchParams.get("unlock");
      if (!claimCode) throw new Error("二维码中缺少成就识别码");
      await claimAchievement(url.searchParams.get("event") ?? config.eventId, claimCode);
    } catch (error) {
      if (/^[a-z0-9_-]+$/i.test(trimmed)) {
        await claimAchievement(config.eventId, trimmed);
        return;
      }
      throw error;
    }
  }, [claimAchievement, config.eventId]);

  useEffect(() => {
    if (!hydrated || processedUrl.current) return;
    processedUrl.current = true;
    if (config.status !== "active") {
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const claimCode = params.get("unlock");
    if (!claimCode) return;
    const claimTimer = window.setTimeout(() => {
      void claimAchievement(params.get("event") ?? config.eventId, claimCode);
    }, 0);
    window.history.replaceState({}, "", window.location.pathname);
    return () => window.clearTimeout(claimTimer);
  }, [claimAchievement, config.eventId, config.status, hydrated]);

  const stopLiveScanner = useCallback(() => {
    if (scannerFrame.current !== null) {
      window.cancelAnimationFrame(scannerFrame.current);
      scannerFrame.current = null;
    }
    scannerStream.current?.getTracks().forEach((track) => track.stop());
    scannerStream.current = null;
    if (scannerVideo.current) scannerVideo.current.srcObject = null;
  }, []);

  const openScanner = useCallback(() => {
    setScannerMessage("");
    setScannerStatus("starting");
    scannerLocked.current = false;
    lastScannerRead.current = 0;
    setScannerOpen(true);
  }, []);

  function closeScanner() {
    stopLiveScanner();
    setScannerOpen(false);
  }

  function restartScanner() {
    closeScanner();
    window.setTimeout(openScanner, 0);
  }

  useEffect(() => {
    if (!scannerOpen) return;
    let disposed = false;

    async function startScanner() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setScannerStatus("unavailable");
        setScannerMessage("实时摄像头需要 HTTPS 安全连接。当前局域网 HTTP 地址无法获得浏览器摄像头权限。");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = scannerVideo.current;
        if (!video) throw new Error("扫码画面尚未准备好");
        scannerStream.current = stream;
        video.srcObject = stream;
        await video.play();
        setScannerStatus("scanning");

        const readFrame = async (time: number) => {
          if (disposed || scannerLocked.current) return;
          if (time - lastScannerRead.current < 140 || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
            scannerFrame.current = window.requestAnimationFrame(readFrame);
            return;
          }
          lastScannerRead.current = time;

          const canvas = scannerCanvas.current;
          const context = canvas?.getContext("2d", { willReadFrequently: true });
          if (!canvas || !context || !video.videoWidth || !video.videoHeight) {
            scannerFrame.current = window.requestAnimationFrame(readFrame);
            return;
          }

          const scale = Math.min(1, 720 / video.videoWidth);
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const decoded = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" });

          if (!decoded?.data) {
            scannerFrame.current = window.requestAnimationFrame(readFrame);
            return;
          }

          scannerLocked.current = true;
          setScannerStatus("verifying");
          stopLiveScanner();
          try {
            await claimFromPayload(decoded.data);
            if (!disposed) setScannerOpen(false);
          } catch (error) {
            if (!disposed) {
              setScannerStatus("error");
              setScannerMessage(error instanceof Error ? error.message : "这个二维码无法识别");
            }
          }
        };

        scannerFrame.current = window.requestAnimationFrame(readFrame);
      } catch (error) {
        stopLiveScanner();
        if (disposed) return;
        const cameraError = error as DOMException;
        const messages: Record<string, string> = {
          NotAllowedError: "没有获得摄像头权限。请在浏览器的网站设置中允许使用摄像头后重试。",
          NotFoundError: "没有找到可用摄像头。",
          NotReadableError: "摄像头正被其他应用占用，请关闭占用摄像头的应用后重试。",
        };
        setScannerStatus("error");
        setScannerMessage(messages[cameraError.name] ?? (error instanceof Error ? error.message : "无法打开摄像头"));
      }
    }

    void startScanner();
    return () => {
      disposed = true;
      stopLiveScanner();
    };
  }, [claimFromPayload, scannerOpen, stopLiveScanner]);

  return (
    <main className={`festival-stage ${config.status === "closed" ? "is-idle" : ""}`}>
      <section className="phone-shell" aria-label="节日成就页面">
        {config.status === "closed" ? (
          <ClosedFestival />
        ) : (
          <div className="festival-scroll">
            <header className="festival-header">
              <div>
                <p className="festival-eyebrow">{config.eyebrow}</p>
                <h1>{config.name}</h1>
              </div>
              <div className="live-badge"><span />活动中</div>
            </header>

            {config.dateLabel || config.subtitle ? (
              <section className="activity-intro">
                {config.dateLabel ? <span>{config.dateLabel}</span> : null}
                {config.subtitle ? <p>{config.subtitle}</p> : null}
              </section>
            ) : null}

            <button className="scan-entry-card" onClick={openScanner}>
              <span className="scan-entry-icon"><QrCode size={23} /></span>
              <span className="scan-entry-copy"><strong>打开二维码扫描器</strong><span>扫描活动二维码并解锁成就</span></span>
              <ArrowRight size={18} />
            </button>

            <section className="progress-card" aria-label={`已解锁${unlockedCount}个，共${activeAchievements.length}个`}>
              <div className="progress-summary">
                <div className="progress-copy">
                  <span className="section-kicker">收集进度</span>
                  <strong>{unlockedCount}<small> / {activeAchievements.length}</small></strong>
                </div>
                <span className="progress-percent">{progress}%</span>
              </div>
              <div className="progress-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
              <p>{progress === 100 ? "全部成就已解锁" : "继续扫描二维码解锁成就"}</p>
            </section>

            <section className="achievement-section" id="achievements">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">当前活动</span>
                  <h2>成就</h2>
                </div>
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
                      {category.description ? <p className="category-description">{category.description}</p> : null}
                      <div className="achievement-grid">
                        {items.map((achievement) => {
                          const record = unlockState.unlocked[achievement.id];
                          return (
                            <article className={`achievement-card ${record ? "is-unlocked" : "is-locked"}`} key={achievement.id}>
                              <div className="achievement-icon" aria-hidden="true">
                                {record ? <AchievementIconGraphic icon={achievement.icon} /> : <LockKeyhole size={21} />}
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
              <span>成就记录仅保存在当前浏览器</span>
            </footer>
          </div>
        )}

        {claimResult ? (
          <div className="claim-overlay" role="dialog" aria-modal="true" aria-label={claimResult.title}>
            <button className="overlay-close" onClick={() => setClaimResult(null)} aria-label="关闭提示"><X size={20} /></button>
            <div className={`claim-seal ${claimResult.kind}`}>
              {claimResult.achievement
                ? <AchievementIconGraphic icon={claimResult.achievement.icon} alt={claimResult.achievement.name} />
                : (claimResult.kind === "error" ? "!" : "✓")}
            </div>
            <span className="claim-kicker">
              {claimResult.kind === "success" ? "成就解锁" : claimResult.kind === "already" ? "重复领取" : "扫码提示"}
            </span>
            <h2>{claimResult.title}</h2>
            {claimResult.achievement ? <h3>{claimResult.achievement.name}</h3> : null}
            <p>{claimResult.message}</p>
            <button className="primary-button" onClick={() => setClaimResult(null)}>返回活动</button>
          </div>
        ) : null}

        {scannerOpen && config.status === "active" ? (
          <div className="scanner-page" role="dialog" aria-modal="true" aria-label="二维码扫描器">
            <header className="scanner-header">
              <div><h2>扫描二维码</h2></div>
              <button onClick={closeScanner} aria-label="关闭扫码页面"><X size={20} /></button>
            </header>

            <div className={`scanner-viewport is-${scannerStatus}`}>
              {scannerStatus === "starting" || scannerStatus === "scanning" || scannerStatus === "verifying" ? (
                <video ref={scannerVideo} muted playsInline aria-label="摄像头扫码画面" />
              ) : (
                <div className="scanner-fallback"><Camera size={34} /><strong>{scannerStatus === "unavailable" ? "实时扫码暂不可用" : "摄像头未能启动"}</strong></div>
              )}
              <span className="scanner-corner top-left" /><span className="scanner-corner top-right" />
              <span className="scanner-corner bottom-left" /><span className="scanner-corner bottom-right" />
              <div className="scanner-state">
                {scannerStatus === "starting" ? <><span className="spinner" />正在打开摄像头</> : null}
                {scannerStatus === "scanning" ? <><span className="scanner-live-dot" />将二维码放入框内</> : null}
                {scannerStatus === "verifying" ? <><span className="spinner" />已识别，正在在线校验</> : null}
              </div>
            </div>
            <canvas ref={scannerCanvas} className="scanner-canvas" aria-hidden="true" />

            {scannerMessage ? <div className="scanner-message"><AlertTriangle size={15} /><span>{scannerMessage}</span>{scannerStatus === "error" ? <button onClick={restartScanner}>重试</button> : null}</div> : null}
            <p className="scanner-privacy">摄像头画面仅在当前设备中实时识别，不会保存或上传；只有活动编号、成就识别码和匿名设备标识会发送给校验服务器。</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ClosedFestival() {
  return (
    <div className="closed-festival">
      <h1>活动未开始</h1>
    </div>
  );
}
