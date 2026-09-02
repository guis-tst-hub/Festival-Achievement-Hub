# NCPA 校园节日成就平台

基于 Next.js、自托管 PostgreSQL 和 Drizzle 的校园活动二维码成就系统。

## 功能

- 两种扫码入口：HTTPS网页摄像头识别，以及手机系统相机扫描直链后自动激活
- 并发安全的领取上限及重复领取检测
- 服务端签名的匿名设备 Cookie；原始设备标识不会写入数据库
- 数据库支持的设备与来源地址速率限制
- 多活动、分类、成就、开放状态和领取计数管理
- 受 HTTP Basic Auth、同源检查和运行时数据校验保护的管理接口
- 访客接口不会暴露二维码识别码

浏览器中的展示进度保存在 `localStorage`，属于匿名、单设备体验；服务器保存不可逆设备哈希和权威领取计数。项目不提供用户账户或跨设备进度同步。

## 推荐部署：Docker Compose

服务器需要 Docker Engine、Compose 插件和一个提供 HTTPS 的反向代理（Nginx、Caddy 等）。项目不依赖任何云数据库或云部署平台。

```bash
git clone <repository-url> festival-hub
cd festival-hub
cp .env.example .env
# 编辑 .env，务必替换三个密码/密钥
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3000/api/health
```

Compose 会启动应用与 PostgreSQL，并在应用启动前自动执行数据库迁移。数据库数据保存在 `postgres_data` Docker volume。默认仅监听 `127.0.0.1:3000`，请由反向代理提供公网 HTTPS；不要直接公开 PostgreSQL。

更新版本：

```bash
git pull
docker compose up -d --build
```

常用命令：

```bash
docker compose logs -f app
docker compose restart app
docker compose down          # 保留数据库
docker compose down -v       # 会永久删除数据库，请谨慎
```

- 访客页：`https://你的域名/`
- 管理台：`https://你的域名/admin`
- 健康检查：`https://你的域名/api/health`

完整备份、恢复、监控和回滚步骤见 [`docs/operations.md`](docs/operations.md)。

## 不使用 Docker 的本地运行

需要 Node.js 22 和 PostgreSQL 14+：

```bash
cp .env.example .env.local
# 修改 DATABASE_URL 和应用密钥；确保 PostgreSQL 数据库已经创建
npm ci
npm run db:migrate
npm run dev
```

## 验证

```bash
npm run lint
npm test
npm run audit:production
```

若设置了 `TEST_DATABASE_URL` 并已执行迁移，单元测试还会验证真实数据库中的并发领取限制。

## 安全边界

- 生产环境必须使用 HTTPS，并为 `ADMIN_PASSWORD`、`POSTGRES_PASSWORD` 和 `CLAIM_DEVICE_SECRET` 使用不同的强随机值。
- 匿名设备限制旨在阻止普通重复领取，不等同于实名身份。来源地址和设备的数据库速率限制用于降低自动化滥用。
- 二维码识别码仅出现在管理员生成的二维码中，不由访客配置接口返回。
- 自定义 HTML 活动包和数据库内图片上传未作为生产功能提供；成就图案使用 Emoji。
