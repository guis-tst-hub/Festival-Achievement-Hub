# 空白活动包模板 2.1

可直接上传 `blank-activity-package.zip` 创建测试活动，也可以复制源文件后交给其他 AI 修改。

## 文件结构

- `manifest.json`：活动包身份、版本和入口页面。
- `festival-config.json`：活动信息、分类、成就、领取码和网页扫码开关。
- `index.html`：手机活动页面结构。
- `assets/theme.css`：主页面视觉样式。
- `assets/claim.css`：扫码验证中、成功、重复领取和失败弹层样式。
- `assets/activity.js`：通过平台 SDK 获取成就和进度、打开扫码页面。

## 必须同步修改的字段

复制为新活动时，必须同时修改 `manifest.json` 与 `festival-config.json` 中的 `eventId`，两个值必须完全相同。建议同时提升 `manifest.json` 的 `version`。

每个成就的 `id` 和 `claimCode` 必须在当前活动内唯一。二维码打印后不要再修改 `eventId` 或 `claimCode`，否则旧二维码会失效。

`categoryId` 必须等于现有分类的 `id`，或设为空字符串表示默认分类。`claimLimit` 是该成就的领取人数上限，不是整个活动的人数上限。

`webScannerEnabled` 默认是 `false`。关闭时参与者仍可使用手机系统相机扫描二维码；需要网页内摄像头时，可在管理员活动设置中开启，但浏览器通常要求 HTTPS。

## 平台边界

活动包负责视觉与内容展示，可接管扫码结果、抽奖和“我的奖品”的 UI；扫码领取、摄像头识别、服务器校验、抽奖执行和兑奖记录仍由外层平台提供。页面通过 `/activity-package-sdk.js` 暴露的 `window.NCPAActivity` 和平台通信。

扫码 UI 接入方法：先调用 `onClaimStateChange(renderClaim)` 监听状态，再调用 `getContext({ themedClaims: true })` 获取初始状态并声明接管扫码弹层。返回的 `context.claim` 与监听器参数均为 `{ pending, result }`。`pending` 表示正在验证；`result` 为空或包含 `kind`（`success` / `already` / `error`）、`title`、`message` 及可选 `achievement`（`id`、`name`、`description`、`icon`）。扫码直链可能在活动包加载前完成，必须同时渲染初始状态和后续事件。结果出现后可再次读取 `getContext()` 刷新成就进度。

“返回活动”调用 `dismissClaim()` 清除平台结果；验证中不可关闭。监听器返回取消订阅函数。未声明 `themedClaims: true` 的旧包继续使用平台默认弹层。模板已内置完整接入，可修改 `assets/claim.css` 和 `renderClaim()` 自定义视觉，无需重复实现领取接口。

不要把 `festival-config.json` 单独发布给参与者，其中包含二维码领取识别码。平台导入时会把它写入受保护的数据库，并不会把该 JSON 当作静态资源公开。

打包时必须让 `manifest.json`、`festival-config.json` 和 `index.html` 位于 ZIP 根目录，不能在 ZIP 外面再套一层文件夹。
