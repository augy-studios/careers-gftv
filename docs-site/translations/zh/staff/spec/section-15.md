---
title: 15. Telegram 机器人（telegram-bot/）
summary: 在同一个代码库里新建一个 telegram-bot 目录，做一个 Telegram 机器人。
---

# 15. Telegram 机器人（`telegram-bot/`）

在同一个代码库里新建一个 `telegram-bot` 目录，做一个 Telegram 机器人。以 `main-site` 里的脚本为基础，这样两边对数据库结构和流程的理解是一致的。它跑在我那台 Debian 13 的 VPS 上，用 tmux 挂着，版本控制用 GitHub。

## 开发惯例

- 用 Telethon，Python。不用 python-telegram-bot，也不用 aiogram。
- 机器人的用户名是 `careersgftv_bot`。任何指令文案或回复里都绝不要提机器人的名字。
- 放一个 `README.md`，说明这个机器人是什么、怎么用。放一个 `setup.md`，讲 BotFather 那边的设置，带上简介文字、描述和指令清单。再放一个 `.gitignore`。
- 每个文件逐个交付。不要压缩包。
- 任何只属于机器人本地的东西都用 SQLite：排程、限流、去重，以及仍在生效的互动按钮的登记表，这样按钮在重启之后也永远还能用。把回调载荷和它的含义存在 SQLite 里，点的时候再查回来。绝不要把状态塞进回调数据里。
- Supabase 是账户、关联、令牌、邀请和通知发件箱的共同事实来源。机器人用 `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY` 直接读写它们。SQLite 绝不复制一份账户数据。
- 回复优先用带格式的富文本，而不是纯文本。避免破折号，宁可改写一个非得靠破折号才通顺的句子。
- 万一以后真的需要什么知识库内容，那要来自一个开源的 REST 接口，绝不是一份写死的清单。

## 指令

- `start` - 机器人做什么、完整的指令清单，以及通往网页应用和捐款链接的按钮。它也处理 `t.me/careersgftv_bot?start=<token>` 带来的深层链接载荷，用于账户关联和一键送验证码。
- `link` - 开始把这个 Telegram 账户和一个平台账户关联起来，给那些先找到机器人、后找到网站的人用。
- `unlink` - 解除关联，配一个确认按钮。
- `code` - 为已关联的账户发一个新的一次性登录验证码。
- `invites` - 列出未处理的职位邀请，每一个都配一个通往该职位的按钮。
- `tasks` - 待办事项的数量，配一个通往 `/account/tasks` 的链接。
- `applications` - 申请人自己的申请清单和当前状态。
- `jobs` - 最新的职位，每一个都配一个通往该职位的按钮。
- `notify` - 切换这个账户要收哪几种通知。
- `docs` - 浏览使用指南，并在聊天里读一页。由第 14 阶段第 10 部分在 2026 年 9 月 7 日加入。它经由第 6 节里的视图读公开页面，不服从任何功能开关。
- `language` - 选择这个聊天使用的语言，压过账户自己的设置，而账户的设置仍然是默认。由第 14 阶段在 2026 年 9 月 11 日加入，偏离 136。

没有 `help` 指令。那些内容由 `start` 承担。

## 关联流程

1. 申请人在账户设置里点“关联 Telegram 做两步验证”。网站建一条 purpose 为 `link` 的 `gftvjobs_telegram_tokens` 记录，存下哈希，并显示那个深层链接和二维码。
2. 他们打开那个深层链接，于是给机器人发出 `/start <token>`。
3. 机器人把载荷做哈希，找到一条还没用过、也没过期的记录。它写入 `gftvjobs_telegram_links` 记录，带上他们的 Telegram 用户 id，把令牌标记为已用，并在聊天里确认。
4. 设置页面正在轮询，不用刷新就会翻成已关联。
5. 令牌十分钟后过期，而且只能用一次。一个已经用过的、过期的或者不认识的令牌，会得到一句清楚的说明，但不透露任何为什么。

## 登录验证码与一次性链接

- `code`，或者两步验证提示上那个按钮，会发出一个六位数验证码。它五分钟内有效、只能用一次、以哈希存储，并有尝试次数上限。
- 一次性链接那个变体，发的是一个一点就直接让申请人登录的按钮。把它当作一次完整的登录，而不是第二重验证，因为它本来就是。把它和发出请求的那个浏览器绑定起来。在请求时把一个随机数存进 cookie，在使用时检查它，这样转发出去的链接对别人毫无用处。它的有效期控制在五分钟。
- 绝不要把验证码或链接发到一个当前并未与正在登录的那个账户关联的 Telegram 账户。
- 按账户和按 Telegram 用户分别限流，反复失败之后要退避。绝不要默默忽略它们。

## 通知

- 网站从不调用机器人。它往 `gftvjobs_notifications` 写一条记录，然后就返回。
- 机器人每 15 到 30 秒轮询那张表一次。它用一次带条件的更新，把记录从 `queued` 移到 `claimed`，一次认领一批，这样两个机器人实例不会重复发送。发出去之后，再标成 `sent` 或者 `failed`，附上错误和尝试次数。失败的退避重试几次，然后就留在 `failed` 让管理员看得到。
- 三种，第一版全部都有：`invite`、`task_raised` 和 `application_status_changed`。像密码被重置或者出现一台新的受信任设备这类安全消息是直接发的，绝不进队列。它们也不受 `notify` 开关管，因为让它们安静下来正是攻击者想要的。没有关联 Telegram 的申请人，他们的记录会被标成 `skipped`，而不是永远留在队列里。**第四种 `application_confirmed` 由第 14 阶段在 2026 年 9 月 11 日加入，偏离 135。** 它是第 13 节第 5 步的确认，也就是入队平台代申请人做出的唯一一次状态变化。它和另外三种一样有一个 `notify` 开关。
- 按种类尊重 `notify` 的开关，并且在通知的页脚永远附上一句怎么退订的提示。
- 别忘了 Telegram 的限流。把发送节奏放慢，遇到 flood wait 错误时在 SQLite 里改期重发，而不是让整个 worker 睡过去。

## 用 Telegram 发邀请

- 管理员邀请一位申请人去某个职位时，网站写下邀请记录，并排一条 `invite` 通知进队列。
- 那条消息写明职位和部门，如果管理员写了备注也附上。它带着查看该职位和婉拒的按钮。婉拒会写回 `gftvjobs_invites`。
- 没有关联 Telegram 的申请人，仍然会在平台的 `/account/tasks` 上看到那个邀请。Telegram 是一条送达渠道，绝不是任何东西的唯一记录。

## 状态探测

2026 年 8 月 26 日加的，在第 12 阶段做，而它和 Telegram 毫无关系。它放在这里，是因为它跑在哪里，不是因为它做什么。0c 的状态页需要一个在 Vercel 之外的探测程序，而**整个架构里唯一在外面的就是这台 VPS**。一个一分钟发四个请求的循环，不值得再开一台机器。而它旁边就有一个已经在跑、已经拿着 Supabase 凭据、也已经在这个代码库里的进程。

- 一个循环，和机器人自己的事件循环分开，而且它出问题时不会把机器人一起拖垮。就算 Telethon 卡住了，探测也应该还在记录。“机器人坏了”和“平台挂了”正是状态页必须分得清的那两件事。
- 每六十秒请求一次 `/api/public/feature-status`、`/search`、一个种子职位页面，以及 `/api/public/jobs.json`。把四个结果在一次调用里报给 `gftvjobs_status_record()`，带上状态码、耗时，以及每一个是否成功。那个函数维护第 6 节里的日计数和故障记录。四个都是公开且只读的，所以这不需要任何平台凭据，也绝不可能改动任何东西。**探测哪一个职位是从公开数据源读来的**，绝不写在配置里，这样种子被清掉之后它会跟着职位板走。
- **它直接写 Supabase，绝不经过平台。**平台上的一个接口，恰恰在最值得记录的那种情况下是不可达的。
- **它不告警。**不给任何人发消息、不往频道发帖、任何指令里都不提它。告警需要一套 on-call 的安排，以及一个“谁会被叫醒”的决定，而这两样都还不存在。这里交付的，是给某个人自己选择去看的那个页面用的数据。
- **连不上 Supabase 时什么都不写。**不在本地缓冲，重连之后也不补写。页面上把空档画成未知，那是真的。一条晚了一个小时才补上、时间戳却写着当时的记录，就不是真的了。
- **它不是一个指令，也不在指令清单里。**关于它的一切在 Telegram 里完全看不见。

## 环境

加进机器人自己的 `.env.example`，写明的方式和网站那份一样：

```bash
# BotFather token for careersgftv_bot.
# Telegram, message BotFather, /mybots, select the bot, API Token.
TELEGRAM_BOT_TOKEN=

# Telegram API credentials for Telethon.
# https://my.telegram.org, API development tools.
TELEGRAM_API_ID=
TELEGRAM_API_HASH=

# Same Supabase project as the site.
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Base URL used when building links back to the portal.
SITE_URL=https://careers.globalfurry.tv

# Shown as a button on the start message.
DONATION_URL=
```
