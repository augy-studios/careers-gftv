---
title: 2. 技术栈与代码库惯例
summary: 每一份都很短，说明那个目录里放什么，以及怎么在里面做事。
---

# 2. 技术栈与代码库惯例

- 前端：原生 HTML、CSS 和 JavaScript。不用框架，不用构建步骤。
- 后端：`main-site/api/` 下的 Vercel 无服务器函数（Node.js）。
- 数据库：Supabase（Postgres），只从无服务器函数里用 service role key 访问。绝不使用 Supabase Auth。绝不把 service role key 暴露给浏览器。
- 网站放在一个 `main-site` 目录里。`api` 目录放在 `main-site` 里面，因为 Vercel 的根目录设成了 `main-site`。
- 四个 README，就只有这四个，外加 `migrations/` 里那一个。不要在每一个子目录里都撒一个 README。

### 各个 README

每一份都很短，说明那个目录里放什么，以及怎么在里面做事。是一页导览，不是一本手册，因为真正的说明文件是第 16 节那个说明文件网站。

- **代码库根目录。**用一段话说明国际兽视入队平台是什么，以及每一个顶层目录放什么。当前做到第几个阶段，并附上通往 `/status` 的链接。怎么运行迁移，以及说明书和环境变量放在哪里。
- **`main-site/`。**网站本身。本地开发、各个环境变量以及每一个是从哪里拿的，还有两套账户体系是怎么摆的。然后是 API 路由的一览、Vercel 项目设置（包括根目录），以及离线测试清单。
- **`telegram-bot/`。**机器人做什么，以及那九个指令。怎么在 VPS 上用 tmux 跑它、它自己的环境变量，以及一个指向 `setup.md` 的说明，那边讲 BotFather 那一端。
- **`docs-site/`。**说明文件网站涵盖什么、16a 里那四批读者，以及哪个角色看得到什么。怎么在两条内容管线里各自新增或修改一个页面，以及它自己的环境变量。怎么在本地预览，包括怎么用一个本地的员工账户登录。怎么跑一次 Playwright 截图，以及它自己那个根目录和域名的 Vercel 项目设置。
- **`migrations/`。**照第 6 节所写。

**保持它们是最新的。**一份 README 从它和代码对不上的那一刻起就过期了，而一份过期的 README 比没有还糟。在做出改动的同一个阶段里就更新受影响的那几份，绝不要事后做一遍清理。下面任何一种情况发生时就要做。一个阶段上线，根目录 README 那行状态要跟着动。一个环境变量新增、移除或者改名。一个目录多了或少了有意义的一部分。一组指令或者路由变了。或者某样东西的运行方式变了。把它当作工作的一部分，和更新 `next-steps.md` 一样。
- 放一个 `.gitignore`，涵盖 `.env`、`.env.local`、`next-steps.md`，以及机器人那个目录里常见的 Python 和 Node 产物。
- 把它做成一个完整可离线的 PWA。第 14 节写清楚了没有网络时哪些能用、哪些不能。
- 密码用 bcrypt 哈希，格式要和 `gftvhello_users` 里已经存着的那种一致，这样现有的账户还能继续用。
- 所有机密都放环境变量。每一个变量都在根目录 README 里写明。

### 环境变量

在 `main-site/.env.example` 放一份并提交入库。它列出每一个变量，每一个上面都有一句注释，说明到底去哪里拿。真正的值放在 `.env.local` 和 Vercel 的项目设置里。`.gitignore` 必须忽略 `.env` 和 `.env.local`，同时把 `.env.example` 留在版本控制里。

```bash
# Supabase project URL.
# Supabase dashboard, Project Settings, Data API, Project URL.
# Use the existing GFTV project, not a new one.
SUPABASE_URL=https://xxxxxxxxxxxxxxxx.supabase.co

# Supabase service role key. Server side only, never sent to the browser.
# Supabase dashboard, Project Settings, API Keys, service_role.
# Bypasses row level security, so treat it like a database password.
SUPABASE_SERVICE_KEY=eyJhbGciOi...

# Public base URL of the site, no trailing slash.
# Used for canonical tags, JSON-LD, redirects, and the login redirect allowlist.
# Locally this is http://localhost:3000.
SITE_URL=https://careers.globalfurry.tv

# Shared secret for the Google Apps Script webhook in section 13.
# Generate one yourself: openssl rand -hex 32
# The same value goes into each form's Apps Script, Project Settings, Script Properties, as PORTAL_SECRET.
FORM_WEBHOOK_SECRET=

# Protects the daily cron endpoint so only Vercel can trigger it.
# Generate one yourself: openssl rand -hex 32
# Vercel sends it as the Authorization bearer token on scheduled invocations.
CRON_SECRET=
```

启动时若少了任何一个变量，就大声失败，并在信息里点名那个变量。绝不要在请求深处抛一个未定义键的错误。不要在这些之外加变量，除非先告诉我为什么。

依第 16 节，说明文件网站是第二个 Vercel 项目，有它自己的函数。所以它有自己的 `docs-site/.env.example`，用完全一样的方式写明。它读同一个 Supabase 项目、同一批员工账户，所以大部分内容是重复的。那是一个代码库里放两个项目的诚实代价，而不是一件要靠共用一个 Vercel 根本读不到的文件来绕开的事。

```bash
# Same Supabase project as the portal. Server side only.
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Public base URL of the docs site, no trailing slash.
# Locally this is http://localhost:3001, so the two sites can run side by side.
DOCS_URL=https://docs.careers.globalfurry.tv

# The portal. Used for the cross links in section 16, the sign in redirects,
# and as the WebAuthn relying party id, per 5e. Do not point this at the docs
# site: a passkey registered on the portal only works here because the two
# share one relying party id, and that id is the portal's host.
SITE_URL=https://careers.globalfurry.tv
```

两个网站都不加 relying party 的变量。平台那边本来就从 `SITE_URL` 推出它。说明文件网站从同一个变量推出同一个 id，再拿回应去和它自己的 `DOCS_URL` 来源对照。正是这一点让一个 passkey 在两边都能用，而 5e 说明了为什么这是被允许的。

### Supabase 相关

- 一切都跑在现有的国际兽视 Supabase 项目里、在 `public` schema 里，和那些 `gftvhello_*` 表并排。不要另建项目，也不要另建 schema。
- 只从服务器端访问。在 Vercel 函数里用 `@supabase/supabase-js`，配上 `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY`，这两个名字在我所有项目里都通用。不要把它们改名成 `SUPABASE_SERVICE_ROLE_KEY` 或者别的什么。浏览器绝不直接和 Supabase 说话，也绝不会拿到 anon key，所以前端里根本没有打包任何 Supabase 客户端。
- 正因如此，在每一张新的 `gftvjobs_*` 表上开启行级安全，并且不加任何策略。service role 会绕过 RLS，所以平台照常能用，而任何拿着 anon key 的东西什么都拿不到。这一点很重要，因为这个项目是和其他国际兽视应用共用的。
- 所有 DDL 都以编号文件放在 `migrations/` 里，在 Supabase 的 SQL 编辑器里手动运行。见第 6 节。需要的扩展：给拼错兜底和自动补全用的 `pg_trgm`，以及在 `gen_random_uuid()` 还没有的情况下要的 `pgcrypto`。用 `create extension if not exists` 启用它们。
- 加权的全文搜索、`ts_headline` 片段和三元组兜底，用 PostgREST 的筛选很难表达。把它们写成 Postgres 函数放在它们自己的迁移文件里，再用 `supabase.rpc()` 调用。建议两个。`gftvjobs_search_jobs(q text, filters jsonb, limit int, offset int)` 返回排好序的记录和一个总数。`gftvjobs_suggest(q text)` 返回分组好的名称、标签和部门联想。
- 把 tsvector 和 `usage_count` 的维护放在 Postgres 触发器里，不要放在应用代码里。这样一个直接在 Supabase 表编辑器里改过的职位，仍然搜得到。
- 分页列表用 `.select('*', { count: 'exact' })`，这样总数是一次往返而不是两次。
- 指向 `gftvhello_users` 的外键只是引用而已。绝不要往任何 `gftvhello_*` 表里插入、更新或删除记录。例外是登录流程本来就拥有的那些会话、挑战、受信任设备和备用码记录。**还有一个点名的例外**，是刻意加的，而且是把冲突摆出来之后才加的。5g 的员工救援流程会写 `gftvhello_users.password_hash`，而且只写那一列。动它之前先读 5g，因为它的后果会波及 gftv.asia。
- Supabase 透过 PgBouncer 做连接池。所以在每个函数模块导入时创建一次客户端，绝不要每个请求创建一次。

### 建议的目录结构

```
/
  README.md
  .gitignore
  gftv-theme.md
  migrations/
    README.md
  telegram-bot/
    README.md
    setup.md
    .env.example
  docs-site/
    README.md
    .env.example
    content/
    login/
    account/
    scripts/
    api/
      _lib/
      _content/
  gen-review.js
  main-site/
    README.md
    .env.example
    index.html
    status/
    placeholder.html
    404.html
    jobs/
    search/
    apply/
    login/
    register/
    account/
    admin/
    assets/
      build-status.json
      css/
      js/
      i18n/
      fonts/
    api/
      _lib/
```

`gen-review.js` 生成一个页面，把每一条可翻译的字符串和它的出处并排列出来，供一位流利的使用者在某种语言公开之前审阅。它的产出不入库，所以要重新生成它，而不是把它提交进去。

如果现有的代码库结构不一样就相应调整，但要保持 `api` 在 `main-site` 里面。
