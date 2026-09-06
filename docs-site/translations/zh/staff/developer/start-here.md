---
title: 从这里开始
summary: 两个网站、两个账户体系、两个 Vercel 项目，以及代码库的形状。
---

# 从这里开始

一页的内容，让完全没有背景的人先有个方向。请在读这里其他任何东西之前先读它。

**国际兽视入队平台是 Global Furry Television 的招募平台**，网址是
[careers.globalfurry.tv](https://careers.globalfurry.tv)。
它是一个公开的职位板，有搜索和筛选、每个职位一个页面，
以及一套登录之后才能走的申请流程。申请本身收集在 Google 表单里。

**所以这个入队平台的工作范围很窄。**
它为一份表单把关、把申请人交接过去、记录这次交接，并追踪后续发生了什么。
它不储存任何答案，也不储存履历。

职位板上的每一个职位都是义务性质、没有报酬的，界面在五个地方说明了这一点。
那是关于目前存在的那些职位的陈述，不是对未来的承诺。
`gftvjobs_jobs.is_paid` 让一则有薪职位可以自行说明相反的情况。

## 技术栈，一张表

| 层 | 是什么 |
|---|---|
| 前端 | 纯 HTML、CSS 和 JavaScript。没有框架。 |
| 后端 | Vercel serverless 函数，Node 20 或更新。 |
| 数据库 | Supabase Postgres，只从函数里用服务角色密钥连接。 |
| 密码 | bcrypt，成本 12，与 `gftvhello_users` 里既有的哈希一致。 |
| 机器人 | Debian VPS 上的 Telethon 和 Python，用 SQLite 保存自己的本地状态。 |

**入队平台没有构建步骤**，这是一条规则，不是偶然。
说明文件网站有一个，规格书第 16e 节把它列为唯一的例外。
本代码库里没有其他任何东西会被编译、打包或转换。

## 两个网站

| 网站 | 目录 | 域名 |
|---|---|---|
| 入队平台 | `main-site/` | `careers.globalfurry.tv` |
| 这个说明文件网站 | `docs-site/` | `docs.careers.globalfurry.tv` |

它们是 **一个代码库上的两个 Vercel 项目**，各有自己的根目录。
那是最可能让您栽跟头的一个事实。
Vercel 项目从自己的根目录构建，无法伸到外面去，
所以 `docs-site/` 无法从 `main-site/` 引入任何一个文件。

**两者共用的东西是由一个生成器复制进来的。**
`node gen-docs-lib.js` 会写出说明文件网站那几份入队平台共用模块的副本，
而 `node gen-docs-lib.js --check` 会在其中某一份过时的时候失败。
请看 [Vercel](/staff/developer/vercel)。

> [!WARNING]
> `docs-site/api/_lib/`、`docs-site/api/auth/staff/` 底下的东西，
> 以及 `docs-site/assets/js/` 里生成出来的文件，一律不编辑。
> 它们每一个开头都会说明自己是生成的，并写明它来自哪个文件。

## 两个账户体系

它们是完全分开的：不同的表、不同的 cookie、不同的辅助模块。
没有任何东西能让其中一个体系的登录状态满足另一个体系的检查，
也没有一个共用的「当前用户」概念。

| | 员工 | 申请人 |
|---|---|---|
| 账户 | `gftvhello_users`，与 gftv.asia 共用 | `gftvjobs_users`，本项目自己的 |
| 登录状态 | `gftvjobs_staff_sessions`，本站则是 `gftvjobs_docs_sessions` | `gftvjobs_sessions` |
| Cookie | `gftv_staff_session` | `gftv_applicant_session` |
| 第二因素 | 通行密钥，或验证器应用 | 通行密钥，或 Telegram 验证码 |
| 怎么进来 | 在 gftv.asia 通过审核，再经过本项目的权限覆盖层 | 立即生效，不需审批 |

**员工账户属于 gftv.asia，这里只读取它们。**
本项目决定的是某个账户能不能从这道门进来，并把那个决定写进自己的表。
请看[身份验证](/staff/developer/authentication)。

## 代码库

| 目录 | 里面有什么 |
|---|---|
| `main-site/` | 入队平台。静态文件加上 `api/`。那个项目在 Vercel 上的根目录。 |
| `docs-site/` | 本站。两棵内容树、它自己的 `api/`，以及唯一的那个构建步骤。 |
| `migrations/` | 编号的 SQL，在 Supabase 的 SQL 编辑器里手动运行。 |
| `telegram-bot/` | 机器人和状态探针。跑在 VPS 上，不在 Vercel 上。 |
| `apps-script/` | 贴进每一个职位 Google 表单里的那段脚本。 |
| `tests/` | Playwright 检查，手动运行。不是持续集成套件。 |

在它们旁边的根目录里还有八个普通的 `node` 脚本，没有一个属于构建。
其中四个是推送前要跑的检查器，
[惯例](/staff/developer/conventions)里列出了它们。

## 五份 README

一共五份，加上 `migrations/` 里的那一份，此外没有别的。
不要在每一个目录里都撒一份 README。

| 在哪里 | 涵盖什么 |
|---|---|
| 代码库根目录 | 项目、各个目录、迁移，以及环境变量。 |
| `main-site/README.md` | 本地开发、两个验证体系、路由地图，以及离线检查清单。 |
| `docs-site/README.md` | 两条流水线、闸门、如何新增一页，以及截图规则。 |
| `telegram-bot/README.md` | 各个指令、在 tmux 底下运行，以及手动检查清单。 |
| `migrations/README.md` | 按顺序列出每一个迁移，以及运行它们的规则。 |
| `tests/README.md` | 怎么运行那些检查、一次运行会写下什么，以及它涵盖不到什么。 |

**请在同一次改动里让它们保持最新**，绝不要留到事后再清理。
一份过时的 README 比没有 README 更糟，因为读它的人会用读最新版一样的信任去读它。

## 在本地运行

```bash
cd main-site
npm install
cp .env.example .env.local   # then fill it in
npx vercel dev
```

说明文件网站用同样的方式从 `docs-site/` 运行，端口不同，
**而且必须先跑过一次它的构建**：

```bash
cd docs-site
npm install
node scripts/build.js
npx vercel dev
```

**缺少变量时，函数会在导入阶段就抛出错误**，并写明是哪一个变量。
那是刻意的：启动时大声失败，胜过一个未定义的值在三层调用之后才出问题。
