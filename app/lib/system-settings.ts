import { getSql } from "../../db";
import { HttpError } from "./server-http";

export type MaintenanceState = {
  active: boolean;
  message: string;
  startedAt: string | null;
  startedBy: string | null;
};

const defaultMaintenance: MaintenanceState = {
  active: false,
  message: "系统正在维护，请稍后再试。",
  startedAt: null,
  startedBy: null,
};

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const rows = await getSql()<{ value_json: string }[]>`SELECT value_json FROM app_settings WHERE key = 'maintenance' LIMIT 1`;
  try {
    const parsed = JSON.parse(rows[0]?.value_json ?? "null") as Partial<MaintenanceState> | null;
    if (!parsed || typeof parsed.active !== "boolean") return defaultMaintenance;
    return {
      active: parsed.active,
      message: typeof parsed.message === "string" && parsed.message.trim() ? parsed.message.slice(0, 160) : defaultMaintenance.message,
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : null,
      startedBy: typeof parsed.startedBy === "string" ? parsed.startedBy : null,
    };
  } catch {
    return defaultMaintenance;
  }
}

export async function setMaintenanceState(active: boolean, actor: string, message = defaultMaintenance.message) {
  const state: MaintenanceState = {
    active,
    message: message.trim().slice(0, 160) || defaultMaintenance.message,
    startedAt: active ? new Date().toISOString() : null,
    startedBy: active ? actor : null,
  };
  await getSql()`
    INSERT INTO app_settings (key, value_json, updated_by, updated_at)
    VALUES ('maintenance', ${JSON.stringify(state)}, ${actor}, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET
      value_json = EXCLUDED.value_json,
      updated_by = EXCLUDED.updated_by,
      updated_at = CURRENT_TIMESTAMP
  `;
  return state;
}

export function githubUpdateConfigured() {
  return Boolean(
    process.env.GITHUB_UPDATE_TOKEN
    && process.env.GITHUB_UPDATE_REPOSITORY
    && process.env.GITHUB_UPDATE_WORKFLOW,
  );
}

export async function dispatchGitHubUpdate() {
  const token = process.env.GITHUB_UPDATE_TOKEN ?? "";
  const repository = process.env.GITHUB_UPDATE_REPOSITORY ?? "";
  const workflow = process.env.GITHUB_UPDATE_WORKFLOW ?? "";
  const ref = process.env.GITHUB_UPDATE_REF || "main";
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^[A-Za-z0-9_.-]+\.ya?ml$/.test(workflow)) {
    throw new HttpError(503, "GitHub update is not configured", "GITHUB_UPDATE_NOT_CONFIGURED");
  }

  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "NCPA-Festival-Achievement-Hub",
      "x-github-api-version": "2026-03-10",
    },
    body: JSON.stringify({ ref }),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 204) {
    const detail = (await response.text()).slice(0, 300);
    throw new HttpError(502, `GitHub rejected update request (${response.status}): ${detail}`, "GITHUB_UPDATE_FAILED");
  }
}
