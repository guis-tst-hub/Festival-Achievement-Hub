# NCPA 活动包接口 v1

这份文档是活动包与平台宿主页之间的稳定约定。制作活动包的开发者或 AI 应优先遵守本文，而不是读取平台内部 React 组件。

## 1. 活动包结构

ZIP 根目录至少包含：

```text
manifest.json
index.html
assets/
```

`manifest.json`：

```json
{
  "eventId": "123",
  "name": "展示活动",
  "version": "1.0.0",
  "entry": "index.html",
  "sdkVersion": 1
}
```

- `eventId` 必须与后台当前活动编号完全一致。
- `version` 是活动包自身版本。
- `entry` 必须指向包内真实存在的 HTML 文件。
- `sdkVersion` 当前只能填写 `1`。
- 活动包应保持静态，不包含 Node.js 服务端代码。

## 2. 加载 SDK

在入口 HTML 中加入：

```html
<script src="/activity-package-sdk.js"></script>
```

SDK 会提供全局对象：

```js
window.NCPAActivity
```

TypeScript 项目可以参考同目录的 `activity-package-sdk.d.ts`。

活动包必须由平台以同源页面加载。直接双击打开 `index.html` 时，宿主接口不会工作。

## 3. 读取活动上下文

```js
const context = await window.NCPAActivity.getContext();
```

返回结构：

```json
{
  "apiVersion": 1,
  "event": {
    "eventId": "123",
    "name": "展示活动",
    "eyebrow": "NCPA",
    "subtitle": "用于测试二维码识别和本地成就解锁。",
    "dateLabel": "测试模式",
    "status": "active"
  },
  "categories": [],
  "achievements": [
    {
      "id": "ach_demo_1",
      "name": "1",
      "description": "第 1 个扫码测试成就",
      "icon": "1",
      "categoryId": "demo-achievements",
      "sortOrder": 10,
      "hidden": false,
      "unlocked": false,
      "unlockedAt": null
    }
  ],
  "progress": {
    "unlocked": 0,
    "total": 6,
    "percent": 0
  },
  "capabilities": ["get-context", "open-scanner"]
}
```

隐藏且尚未解锁的成就不会向活动包暴露真实名称、说明或图案。

## 4. 打开平台扫码器

活动包中的按钮可以调用：

```js
document.querySelector("#scan").addEventListener("click", async () => {
  await window.NCPAActivity.openScanner();
});
```

摄像头权限、二维码读取、活动匹配、领取上限和服务器校验都由平台宿主页负责。

## 5. 完整最小示例

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>活动页面</title>
</head>
<body>
  <h1 id="title">正在读取活动</h1>
  <p id="progress"></p>
  <button id="scan">扫描二维码</button>

  <script src="/activity-package-sdk.js"></script>
  <script>
    async function start() {
      const context = await window.NCPAActivity.getContext();
      document.querySelector("#title").textContent = context.event.name;
      document.querySelector("#progress").textContent =
        `${context.progress.unlocked} / ${context.progress.total}`;
    }

    document.querySelector("#scan").addEventListener("click", () => {
      window.NCPAActivity.openScanner().catch(console.error);
    });

    start().catch(console.error);
  </script>
</body>
</html>
```

## 6. 不允许的做法

- 不要在活动包中直接调用 `/api/claims`。
- 不要提供“输入识别码直接领取”的学生端入口。
- 不要把用户解锁状态另存成另一套权威数据。
- 不要修改二维码中的 `eventId` 或 `claimCode`。
- 不要依赖平台内部 CSS 类名或 React 组件，它们不是稳定接口。
- 不要在活动包中放密码、密钥或管理员令牌。

平台故意不提供“直接解锁成就”接口，防止活动包脚本绕过扫码流程。

## 7. 当前实现边界

接口类型、宿主页消息处理和浏览器 SDK 已经存在；后台目前仍只检查并模拟发布 ZIP，还没有把活动包持久化到服务器并加载为正式活动页面。后续实现加载器时，应使用同源隔离的 `iframe` 加载活动包，并继续沿用本接口，不要让活动包直接获得管理接口权限。
