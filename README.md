# NCPA 校园节日成就平台

基于 Next.js、自托管 PostgreSQL 和 Drizzle 的校园活动二维码成就系统。

## 功能

- 两种扫码入口：HTTPS网页摄像头识别，以及手机系统相机扫描直链后自动激活
- 并发安全的领取上限及重复领取检测
- 服务端签名的匿名设备 Cookie；原始设备标识不会写入数据库
- 数据库支持的设备与来源地址速率限制
- 多活动、分类、成就、开放状态和领取计数管理
- 数据库管理员账号、8 小时安全会话、CSRF 和同源检查保护的管理接口
- 超级管理员可管理普通管理员并拉取 GitHub 更新；普通管理员仍可管理活动、成就、分类、活动包和维护提示
- 管理台可触发受控 GitHub Actions 部署，并在更新期间向前后端展示维护状态
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

学校本地服务器通过 GitHub Actions、GHCR和生产 Compose发布的完整流程见 [`docs/school-server-deployment.md`](docs/school-server-deployment.md)。

## 管理员账号

数据库中尚无管理员时，首次登录会使用 `.env` 中的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 创建唯一的超级管理员。之后这两个变量只作为首次初始化配置，普通管理员由超级管理员在“管理员面板”中创建，每位管理员均使用自己的用户名和密码登录。

如需让管理台的“拉取 GitHub 更新”按钮生效，还需按照 [`docs/school-server-deployment.md`](docs/school-server-deployment.md) 配置服务器上的自托管 GitHub Actions Runner，以及具有目标仓库 `Actions: Write` 权限的细粒度令牌。网站不会访问 Docker Socket。

## 活动包

进入管理台并选择一个活动后，可从左侧的“活动包管理”导入 ZIP。根目录必须包含：

- `manifest.json`：活动包名称、版本、入口页面和 `sdkVersion: 1`
- `festival-config.json`：分类、成就和二维码识别码
- `index.html`：或 `manifest.entry` 指定的其他 HTML 入口
- 页面所需的 CSS、JavaScript、图片、字体或音频资源

导入会更新当前活动的名称、说明、分类和成就，但保留当前活动编号及开放状态。配置文件中的二维码识别码只会进入受保护的数据库，不会作为静态文件公开。活动包页面可通过 `/activity-package-sdk.js` 提供的 `window.NCPAActivity.getContext()` 和 `openScanner()` 接入平台。可直接上传 [`examples/cyberpunk-neon-package.zip`](examples/cyberpunk-neon-package.zip) 测试完整流程。

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
- 自定义 HTML 活动包以受限 ZIP 格式导入并保存在 PostgreSQL 中，页面始终在浏览器沙箱内运行；成就图案仍建议使用 Emoji。
