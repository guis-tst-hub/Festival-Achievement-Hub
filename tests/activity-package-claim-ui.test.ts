import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import vm from "node:vm";

class UiNode {
  textContent = "";
  children: UiNode[] = [];
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  hidden = true;
  open = false;
  disabled = false;
  classList = { add() {}, remove() {}, toggle() {} };
  listeners = new Map<string, (event: { preventDefault(): void }) => void>();
  append(...nodes: UiNode[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: UiNode[]) { this.children = nodes; }
  setAttribute() {}
  addEventListener(name: string, handler: (event: { preventDefault(): void }) => void) { this.listeners.set(name, handler); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  text(): string { return [this.textContent, ...this.children.map(child => child.text())].join(" "); }
}

for (const name of ["blank-activity-package", "obsession-halloween-package"]) {
  test(`${name} renders an early claim, pending, repeated and failed claims and clears the result on return`, async () => {
    const nodes = new Map<string, UiNode>();
    function node(id: string) {
      if (!nodes.has(id)) nodes.set(id, new UiNode());
      return nodes.get(id)!;
    }
    const achievement = { id: "first", name: "第一枚成就", description: "完成第一站", icon: "★" };
    let claim: { pending: boolean; result: null | { kind: string; title: string; message: string; achievement?: typeof achievement } } = {
      pending: false, result: { kind: "success", title: "新成就已解锁", message: "完成第一站", achievement },
    };
    let notify: (state: typeof claim) => void;
    let dismissed = 0;
    const calls: string[] = [];
    const sdk = {
      onClaimStateChange(listener: typeof notify) { notify = listener; calls.push("subscribe"); },
      async getContext(options: { themedClaims?: boolean }) {
        calls.push("context");
        assert.equal(options.themedClaims, true);
        return {
          event: { eyebrow: "", name: "活动", subtitle: "", dateLabel: "", eventId: "test", categories: [], taskLine: [], webScannerEnabled: false },
          achievements: [], lotteries: [], wins: [], claim,
        };
      },
      async dismissClaim() { dismissed++; claim = { pending: false, result: null }; notify(claim); return true; },
    };
    vm.runInNewContext(readFileSync(new URL(`../examples/${name}/assets/activity.js`, import.meta.url), "utf8"), {
      document: {
        getElementById: node, querySelector: node, createElement: () => new UiNode(),
        addEventListener() {}, body: new UiNode(), hidden: false,
      },
      window: { NCPAActivity: sdk, addEventListener() {}, setInterval() {} },
    });
    await setImmediate();
    assert.deepEqual(calls.slice(0, 2), ["subscribe", "context"]);
    const dialog = node("claim-dialog");
    const content = node("claim-content");
    assert.equal(dialog.open, true);
    assert.match(content.text(), /新成就已解锁/);
    assert.match(content.text(), /第一枚成就/);
    assert.equal(dialog.dataset.kind, "success");

    claim = { pending: true, result: null };
    notify!(claim);
    assert.match(content.text(), /正在验证二维码/);
    assert.doesNotMatch(content.text(), /返回活动/);
    let prevented = false;
    dialog.listeners.get("cancel")!({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(dismissed, 0);

    claim = { pending: false, result: { kind: "already", title: "你已经获得此成就", message: "完成第一站", achievement } };
    notify!(claim);
    await setImmediate();
    assert.match(content.text(), /你已经获得此成就/);
    assert.equal(dialog.dataset.kind, "already");

    claim = { pending: false, result: { kind: "error", title: "领取名额已满", message: "已经领完" } };
    notify!(claim);
    await setImmediate();
    assert.match(content.text(), /领取名额已满/);
    assert.doesNotMatch(content.text(), /第一枚成就/);
    assert.equal(dialog.dataset.kind, "error");
    const done = content.children.find(child => child.textContent === "返回活动")!;
    done.listeners.get("click")!({ preventDefault() {} });
    await setImmediate();
    assert.equal(dismissed, 1);
    assert.equal(dialog.open, false);
    assert.equal(claim.result, null);
  });
}
