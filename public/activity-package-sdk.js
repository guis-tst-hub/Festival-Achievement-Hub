(function installNCPAActivityPackageSdk() {
  "use strict";

  const API_VERSION = 1;
  const pending = new Map();

  function createRequestId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function request(type) {
    if (window.parent === window) {
      return Promise.reject(new Error("活动包必须由 NCPA 活动页面加载后才能调用宿主接口"));
    }

    const requestId = createRequestId();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("活动包接口响应超时"));
      }, 5000);

      pending.set(requestId, { resolve, reject, timeout });
      window.parent.postMessage({ type, requestId }, window.location.origin);
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || typeof message !== "object" || typeof message.requestId !== "string") return;
    const task = pending.get(message.requestId);
    if (!task) return;

    window.clearTimeout(task.timeout);
    pending.delete(message.requestId);
    if (message.type === "ncpa:activity-package:error") {
      task.reject(new Error(String(message.message || "活动包接口调用失败")));
      return;
    }
    task.resolve(message.context ?? message);
  });

  window.NCPAActivity = Object.freeze({
    apiVersion: API_VERSION,
    getContext() {
      return request("ncpa:activity-package:get-context");
    },
    openScanner() {
      return request("ncpa:activity-package:open-scanner");
    },
  });
})();
