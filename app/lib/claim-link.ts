export type ClaimTarget = {
  eventId: string;
  claimCode: string;
};

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
const CLAIM_CODE_PATTERN = /^[a-z0-9_-]{3,120}$/i;

export function parseClaimPayload(payload: string, baseUrl: string, fallbackEventId: string): ClaimTarget {
  const trimmed = payload.trim();
  if (!trimmed) throw new Error("二维码内容为空");

  if (CLAIM_CODE_PATTERN.test(trimmed)) {
    if (!EVENT_ID_PATTERN.test(fallbackEventId)) throw new Error("二维码中缺少有效的活动编号");
    return { eventId: fallbackEventId, claimCode: trimmed };
  }

  let url: URL;
  try {
    url = new URL(trimmed, baseUrl);
  } catch {
    throw new Error("二维码不是有效的活动链接");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("二维码不是有效的网页链接");
  }

  const eventId = (url.searchParams.get("event") ?? fallbackEventId).trim();
  const claimCode = (url.searchParams.get("unlock") ?? "").trim();
  if (!EVENT_ID_PATTERN.test(eventId)) throw new Error("二维码中缺少有效的活动编号");
  if (!CLAIM_CODE_PATTERN.test(claimCode)) throw new Error("二维码中缺少有效的成就识别码");
  return { eventId, claimCode };
}

export function clearClaimParameters(urlValue: string) {
  const url = new URL(urlValue);
  url.searchParams.delete("event");
  url.searchParams.delete("unlock");
  return `${url.pathname}${url.search}${url.hash}`;
}
