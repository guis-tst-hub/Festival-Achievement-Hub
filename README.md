# NCPA 校园节日成就平台

基于 Next.js、Neon Postgres 和 Drizzle 的校园活动二维码成就系统。

## 功能

- HTTPS 摄像头扫码和服务器端领取校验
- 并发安全的领取上限及重复领取检测
- 服务端签名的匿名设备 Cookie；原始设备标识不会写入数据库
- 数据库支持的设备与来源地址速率限制
- 多活动、分类、成就、开放状态和领取计数管理
- 受 HTTP Basic Auth、同源检查和运行时数据校验保护的管理接口
- 访客接口不会暴露二维码识别码

浏览器中的展示进度保存在 `localStorage`，属于匿名、单设备体验；服务器保存不可逆设备哈希和权威领取计数。项目不提供用户账户或跨设备进度同步。

## 本地运行

需要 Node.js 22 和一个 Neon/Postgres 数据库：

```bash
cp .env.example .env.local
npm ci
npm run db:migrate
npm run dev
```

请为 `ADMIN_PASSWORD` 和 `CLAIM_DEVICE_SECRET` 使用独立的强随机值。生产环境必须使用 HTTPS。

- 访客页：<http://127.0.0.1:3000/>
- 管理台：<http://127.0.0.1:3000/admin>
- 健康检查：<http://127.0.0.1:3000/api/health>

## 验证

```bash
npm run lint
npm test
npm run audit:production
```

若设置了 `TEST_DATABASE_URL` 并已执行迁移，单元测试还会验证真实数据库中的并发领取限制。CI 的数据库任务由仓库变量 `RUN_DATABASE_TESTS=true` 和 Secret `TEST_DATABASE_URL` 启用。

## 部署

1. 在 Vercel 创建项目并连接 Neon。
2. 配置 `DATABASE_URL`、`ADMIN_USERNAME`、`ADMIN_PASSWORD` 和 `CLAIM_DEVICE_SECRET`。
3. 在目标数据库执行 `npm run db:migrate`。
4. 部署后确认 `/api/health` 返回 200，并执行访客扫码及管理台冒烟测试。

完整的备份、恢复、监控和回滚步骤见 [`docs/operations.md`](docs/operations.md)。

## 安全边界

- 匿名设备限制旨在阻止普通重复领取，不等同于实名身份。来源地址和设备的数据库速率限制用于降低自动化滥用。
- 二维码识别码仅出现在管理员生成的二维码中，不由访客配置接口返回。
- 自定义 HTML 活动包和数据库内图片上传未作为生产功能提供；成就图案使用 Emoji。
