# Pulse Hub · 行业头条聚合站

每天定时抓取 AI 前沿、技术社区、财经三个频道的官方信息源，自动归一化、去重、按天归档，构建成纯静态站点并部署到 GitHub Pages。

**只保存标题 + ≤80 字一句话摘要 + 原文链接 + 来源 + 发布时间**，不存正文、不做镜像；
feed 描述就是正文或完整摘要的源，只存标题（见 `scripts/sources.mjs` 的 `summary: false`）。

- 线上地址：`https://<用户名>.github.io/pulse-hub/`
- 技术栈：Astro 4（静态输出）+ Tailwind CSS 3 + Pagefind（构建期静态搜索）；零框架运行时，主题切换、标签筛选、排序全部是组件 + 内联脚本
- 抓取端：独立 Node 脚本 + GitHub Actions 定时任务，无服务器、无数据库

---

## 1. 工作原理

GitHub Pages 没有后端，所以"定时抓取"由 GitHub Actions 承担，站点只消费构建期就位的 JSON：

```
cron（每天 2 次）触发 .github/workflows/pulse.yml
  → node scripts/fetch.mjs      多源并发抓取 → 归一化 → 去重 → 写 data/*.json
  → git commit + push           数据有变化才提交
  → npm run build               Astro 读取 JSON 生成全部静态页（含 rss.xml / sitemap.xml）
  → pagefind --site dist        生成静态搜索索引
  → upload-pages-artifact + deploy-pages
```

抓取、提交、构建、部署**必须在同一个 job 内顺序完成**：`GITHUB_TOKEN` 推送的提交不会触发 `on: push` 的下游 workflow。

## 2. 目录结构

```
pulse-hub/
├─ .github/workflows/pulse.yml   定时抓取 + 构建 + 部署（唯一 workflow）
├─ data/
│  ├─ items/YYYY-MM-DD.json      按北京时间自然日归档的条目（滚动保留 90 天）
│  ├─ index.json                 日期索引 + 每频道计数
│  ├─ health.json                每源最近状态：ok/error/skipped、原因、最后成功时间
│  └─ sources.json               源清单快照，供 /sources 页渲染
├─ scripts/
│  ├─ sources.mjs                声明式源注册表（唯一需要改的文件）
│  ├─ fetchers/{rss,hn,github,api}.mjs   每种通道一个 fetcher
│  ├─ normalize.mjs              URL 归一化、白空格/实体处理、首句摘要、标题指纹、id 生成
│  ├─ dedupe.mjs                 id → canonicalUrl → 频道内标题指纹 三层去重
│  ├─ prune.mjs                  滚动清理保留期外的归档
│  ├─ fetch.mjs                  编排：并发、单源超时、失败隔离、写盘、更新 health
│  └─ lib/{http,files}.mjs       带重试的 fetch 封装、数据文件读写
├─ src/
│  ├─ lib/items.ts               构建期载入 data/*.json 并提供分组/排序/时间格式化
│  ├─ pages/                     index / channel/[channel] / daily / sources / search / about / rss.xml / sitemap.xml / robots.txt
│  └─ components/                ItemCard / ChannelNav / TagFilter / Header / Footer / ThemeToggle
├─ tests/                        normalize / dedupe / rss 解析的离线单测
├─ docs/                         信息源探测记录、部署平台对比（本地保留，不随仓库提交）
├─ public/                       图标资源：favicon.svg + ICO/PNG 回退 + apple-touch-icon
└─ astro.config.mjs              site + base（CI 下自动启用 /pulse-hub/）
```

## 3. 本地开发

```bash
npm ci            # 依赖锁定文件已包含 .npmrc 的 legacy-peer-deps 配置
npm run fetch     # 抓一轮数据（写 data/）
npm run dev       # 本地预览 http://localhost:4321
npm run build     # 构建 + 生成 Pagefind 搜索索引
npm run preview   # 预览构建产物（搜索功能只在构建产物里可用）
npm test          # 离线单测，不联网
```

抓取脚本常用参数：

```bash
node scripts/fetch.mjs --dry-run                 # 只打印统计，不写盘
node scripts/fetch.mjs --only openai-news        # 只抓一个源
node scripts/fetch.mjs --limit 3                 # 每源最多 3 条
node scripts/fetch.mjs --keep-days 30            # 改保留期
node scripts/fetch.mjs --concurrency 2           # 降并发
```

### 界面

- **主题三态**：浅色 → 深色 → 跟随系统（`localStorage.theme` 存 `light`/`dark`/`system`）。
  首屏由 `BaseLayout` 的内联脚本在渲染前套用，不会闪白；选「跟随系统」时会监听
  `prefers-color-scheme` 变化。切换动效走 View Transitions 的圆形揭示（Chrome/Edge 120+、
  Safari 18+），Firefox 等不支持 `startViewTransition` 的浏览器降级为瞬时切换，
  `prefers-reduced-motion` 下同样关闭动画。
- **响应式**：断点只用 `sm`(640) 和 `lg`(1024)。手机上频道导航为单列、`/sources` 的
  6 列表格换成卡片、按钮点击区 ≥40px、Pagefind 输入框固定在 16px（低于该值 iOS 聚焦会自动放大页面）。
  卡片悬停效果用 `@media (hover: hover) and (pointer: fine)` 限定，避免触屏设备上手指抬起后高亮「粘住」。

## 4. 数据模型

```ts
{
  id, sourceId, sourceName, channel: 'ai' | 'tech' | 'finance' | 'policy',
  title, summary,            // summary 取描述首句，≤80 码点；summary:false 的源为空
  url, canonicalUrl,         // canonicalUrl 去掉 utm_* 等追踪参数与尾斜杠
  publishedAt, fetchedAt,    // fetchedAt 保留首次入库时间，避免无意义 diff
  tags: string[], signals: { points?, stars?, replies?, reactions? },
  lang, weight, titleKey
}
```

关键规则：

- `id = sha1(sourceId + externalId)` 取前 16 位；`externalId` 取 RSS guid / HN id / arXiv id / GitHub full_name
- 排序信号只用源站现成指标（HN points、GitHub stars），不自造热度分
- 失败隔离：单源 15s 超时，单源异常全部收敛为 health 状态（`runSource` 内部 catch），失败只写 `health.json`，历史数据保留
- 归档口径固定为 `Asia/Shanghai`

## 5. 信息源

| 频道 | 来源 |
| --- | --- |
| AI 前沿 | 量子位(中)、OpenAI News、Google DeepMind、Google Research、Hugging Face Blog、Meta AI、Microsoft Research、arXiv `cs.AI`/`cs.LG`、Hacker News（Algolia 关键词搜索） |
| 技术社区 | Solidot 奇客(中)、InfoQ 中文(中)、开源中国(中)、Hacker News 首页、GitHub Search API（按 stars+日期模拟 Trending）、DEV Community、V2EX 热门 |
| 财经 | 钛媒体(中)、华尔街见闻 7×24 快讯(中)、CNBC Earnings、MarketWatch 头条、Seeking Alpha 快讯、Alpha Vantage NEWS_SENTIMENT、Finnhub 市场要闻 + 财报新闻（最后两个**需在 Secrets 配 Key**）；华尔街见闻资讯、36氪快讯、财新最新 **默认 `enabled: false`**，需自建 RSSHub 后开启 |


标 `(中)` 的是官网原生中文 RSS，均已实测可解析（响应体为真 XML、条目时间可提取）。
地址的逐个探测结果与不可用清单见本地 `docs/信息源实测清单.md`（`docs/` 不随仓库提交）。

**财报新闻的接入情况**（2026-10 实测）：

- 中文财经媒体的 RSS 基本已经全部下线：华尔街见闻 `rss.xml` 返回 S3 `NoSuchKey`，
  财新 / 36氪 / 第一财经 / 格隆汇的 RSS 地址返回 HTML，Reuters 公开 feed 已关停，Yahoo Finance 返回 403。
  唯一能直连的是华尔街见闻站点自用的 JSON 快讯接口（`wallstreetcn-live`，非官方接口，随时可能变）；
  其余中文源只能走 RSSHub。
- **雪球今日话题已排除**：它的 RSS 是全文 feed，单篇 12.9 KB、全量 11732 个 HTML 实体，
  会直接撞上 XML 解析器的实体展开上限（`Entity expansion limit exceeded`）；
  而且内容是个人投资心得，不是财报，与频道定位不符。
- **Finnhub 没有 `earnings` 分类**：`/news?category=` 官方只接受 `general` / `forex` / `crypto` / `merger`。
  所以 `finnhub-earnings` 实际是拉 `general` 全量后按标题关键词（earnings / quarter / EPS / guidance…）
  在本地过滤，词表见 `scripts/fetchers/api.mjs` 的 `EARNINGS_PATTERN`。上游若哪天放开 earnings 分类，
  删掉这段过滤即可。

增删源只需要改 `scripts/sources.mjs`，字段含义见文件头部注释。三个要点：

- `channel` 决定条目落在哪个频道。混合 feed（如钛媒体同时发科技与财报）只能挂一个频道，
  选最贴近的那个；若后续需要逐条分流，得在 `scripts/normalize.mjs` 里做按标签/关键词的二次归类。
- `lang` 会参与排序（`src/lib/items.ts` 的 `rankItems`）：中文条目先按权重排，英文条目随后。
  这样英文源数量再多也不会把中文内容全挤到后面。
- `tier`（`official` / `media` / `community`）只影响 `/sources` 页的三段式分组，不参与排序；
  它通过 `data/sources.json` 传给页面，所以改完要跑一次 `npm run fetch` 才会生效。
- **抓取开关在 `config/sources.json`**，与代码分离，改完提交即生效：

  ```json
  {
    "groups": { "tier.community": false, "channel.finance": false },
    "sources": { "solidot": true }
  }
  ```

  优先级 `sources.<id>` > `groups.<键>` > 源自身的 `enabled`；分组支持
  `tier.*` / `channel.*` / `lang.*` / `type.*`，分组之间是「与」关系（任一组关掉该源就不抓）。
  配置写坏时退回默认值并打警告，不会阻断抓取。

### 页面上的抓取控制台（`/sources`）

改文件毕竟要开编辑器，所以 `/sources` 顶部有个「抓取控制台」：连上仓库后，页面上的每个源、
每个分组的开关会直接调 GitHub Contents API 提交 `config/sources.json`，下一次抓取即生效。

纯静态站本来没有写权限，这里的做法是让**使用者自己**把 fine-grained PAT 填进表单：

- 令牌只存在本机 `localStorage`（key `pulse-github-conn`），只会发往 `api.github.com`，
  不经过任何第三方；换设备要重新填一次，公共电脑不要连。
- 需要的权限只有 **Contents: Read and write**；想用「立即抓一次」按钮再加 **Actions: Read and write**。
- 没连接时所有开关只读，显示上一次抓取快照里的 `enabled`，不会让人误以为全部关掉了。
- 分组开关会写 `groups.tier.*`，同时**清掉该组内所有单源覆盖**，否则之前单独点过的源不会跟着变；
  `channel.*` / `lang.*` / `type.*` 这些分组键页面上不管，要直接改文件。
- 每次改动是一次 commit（`chore(config): 更新抓取开关`），用文件里的 `sha` 做并发保护，
  冲突时自动重新加载并提示重点一次。

没有令牌时的替代做法是直接改文件提交，效果完全一样。另外 `/sources` 每行的眼睛按钮是
**本机隐藏**（存 `localStorage`，只影响你自己看到什么，不影响抓取），与开关是两件事。

### 财报日程（财经频道页顶部）

财经频道页在导航条下面会多渲染一块「财报日程」，数据来自 Finnhub `/calendar/earnings`。
它**不是** `data/items` 的一部分，原因是两者的时间语义正好相反：

- `items` 按「已经发布」的时间戳归档，`rankItems` 按时间倒序排，`data/index.json` 也按过去的日期分桶
- 财报日程是**未来事件**

混在一起会让未来条目排到列表最前面，还会让 `data/index.json` 凭空多出未来日期的桶。
所以它单独存 `data/earnings.json`，只在频道页单独渲染，由 `scripts/fetch-earnings.mjs` 生成
（`npm run fetch` 会在末尾自动调用它）。

几个行为说明：

- **没配 `FINNHUB_KEY` 时整块不渲染**（不是显示空壳或占位），所以本地开发看不到这块是正常的；
  抓取失败或套餐无权限（403）时同理，只在 `data/earnings.json` 里留 `status` 与 `reason`。
- **关注列表在 `config/earnings-watchlist.json`**，抓取端与页面端读同一份。
  Finnhub 的日历是全市场口径（一天几百家），不筛的话页面没法看；
  文件丢失或写坏时抓取端退回内置的 13 只核心票并打警告，页面端此时不做额外过滤。
- 页面端也会再筛一遍 watchlist：`data/earnings.json` 是构建期读的静态文件，
  可能是上一轮抓的，收窄过列表后旧票不应该继续留在页面上。
- `hour` 对应盘前（`bmo`）/ 盘中（`dmh`）/ 盘后（`amc`），空值显示「待定」。
- 已公布（`epsActual` 有值）的行显示「实际 / 预期」与超预期百分比；日期按**美东口径**，不做时区换算。

由于这块依赖 `FINNHUB_KEY`，本地想验 UI 可以临时写一份 `data/earnings.json`（`status: "ok"` + 几条 events），
验证完重跑 `node scripts/fetch-earnings.mjs` 就会覆盖回真实的 `skipped` 状态。

### 上线前置条件

| Secrets | 作用 | 必需 |
| --- | --- | --- |
| `DATA_PUSH_TOKEN` | fine-grained PAT，用于推送数据提交；避免 public 仓库 60 天无活动导致 scheduled workflow 被禁用 | 强烈建议 |
| `ALPHAVANTAGE_KEY` / `FINNHUB_KEY` | 财经频道 API Key，缺省该源记为 skipped；`FINNHUB_KEY` 同时用于财报日程，缺省则不渲染该模块 | 财经需 |


`GITHUB_TOKEN` 由 Actions 自动注入，抓取端用它提高 GitHub Search API 额度。

`DATA_PUSH_TOKEN` 的创建步骤（fine-grained PAT、仅授权本仓库、Contents + Actions 读写）见本地
`docs/GitHub-Fine-grained-PAT-生成指南.md`（`docs/` 不随仓库提交）；同一个令牌也可以填进
`/sources` 页的「抓取控制台」，用来在页面上开关信息源、手动触发一轮抓取。

## 6. 部署到 GitHub Pages

1. 仓库名设为 `pulse-hub`（`base` 与仓库名绑定；换名需同步改 `astro.config.mjs` 里的 `base` 与 `site`）
2. 把 `astro.config.mjs` 的 `site` 改成 `https://<用户名>.github.io`
3. Settings → Pages → Source 选 **GitHub Actions**
4. Settings → Secrets and variables → Actions 里配置上表中的 Secrets
5. Actions 里手动 `Run workflow` 跑一次，确认：抓取有产出、提交已推送、`deploy` 步骤绿、站点可访问

`base` 由 `process.env.CI === 'true'` 控制：本地开发是 `/`，Actions 里是 `/pulse-hub/`。

上面五步是概览。**逐步骤的具体操作**（Secrets 创建、首次触发后九个步骤的逐项验收、故障排查、
日常换源与维护、完整检查清单）见本地 `docs/GitHub-Pages-部署指南.md`（`docs/` 不随仓库提交）。

国内平台（Gitee Pages / EdgeOne / ESA / Cloudflare Pages）的现状对比、为什么抓取端不应该搬到国内、
以及三阶段迁移路径，见本地 `docs/国内部署平台对比与迁移路径.md`（`docs/` 不随仓库提交）。

## 7. 合规与版权

- 只存标题、一句话摘要（≤80 字）、原文链接、来源名、时间，不存正文、不做镜像
- 只访问官方 RSS/Atom 与公开 API，不解析目标站 HTML、不抓微信公众号、不碰付费墙
- 请求携带可识别 UA，单源串行且间隔 ≥1s，失败指数退避
- 不使用明确禁止生产环境使用的免费新闻 API（NewsAPI / GNews 免费层）
- `/about` 页面写明数据来源与"跳转原文"声明；财经频道只呈现标题与链接，不加解读

## 8. 已知问题与偏离说明

- **`legacy-peer-deps`**：原本是 Vue 主题按钮带来的 `@vue/devtools-core` peer 声明问题（`npm install` 会报 `Cannot read properties of null (reading 'edgesOut')`）。主题切换现已改为纯 Astro 组件、`@astrojs/vue` 也已从 `astro.config.mjs` 移除，但 `package.json` 里的依赖还留着（不再参与构建，可 `npm uninstall @astrojs/vue vue` 彻底清掉，同时可删除 `.npmrc` 里的 `legacy-peer-deps=true`）。当前 `.npmrc` 保留原设置，`npm ci` 可正常执行。
- **未使用 `@astrojs/sitemap`**：该集成 3.7.x 依赖 Astro 5 才有的 `astro:routes:resolved` 钩子，在 Astro 4 下构建会抛 `Cannot read properties of undefined (reading 'reduce')`。改为 `src/pages/sitemap.xml.ts` 手写端点（路由有限且可枚举），`robots.txt` 同为端点，二者都跟随 `base` 变化。
- **全站零框架运行时**：标签筛选、排序条、主题切换、移动菜单全部是 Astro 组件 + 内联脚本，
  `dist` 产物里没有任何 JS bundle，首屏 JS 只有几段内联脚本。服务端 HTML 完整保留，无脚本也能浏览全部内容。
- **Pagefind 对中文不做词干还原**：`zh-cn` 下提示 "doesn't support stemming"，检索仍可用，但不会跨词根匹配。
- 首次上线时部分源可能失败（本机网络、区域限制），状态会显示在 `/sources`；连续失败先检查源地址是否变更。
