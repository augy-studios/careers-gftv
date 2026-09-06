---
title: 6. 数据库
summary: 不要改动任何现有的 gftvhello_* 表。
---

# 6. 数据库

不要改动任何现有的 `gftvhello_*` 表。

### 迁移

所有 DDL 都以编号的 SQL 文件放在代码库根目录的 `migrations/` 目录里。我按顺序手动运行它们，一个一个贴进 Supabase 的 SQL 编辑器。没有命令行工具、没有自动执行器，也没有迁移框架。

- 文件命名为 `001_description.sql`、`002_description.sql` 这样，前面补零，按它们必须运行的先后排序。一个文件只管一件事。顺序是先扩展，再核心表，再身份验证的表，再职位。然后是申请和分析，再来是搜索函数和触发器。然后是 Telegram 和通知，最后是种子参考数据。
- 每个文件开头都有一段注释：它创建什么、它出自说明书的哪一节，以及在它之前必须先跑过什么。
- 每个文件都用 `begin` 和 `commit` 包起来，这样跑到一半失败不会留下任何残余。
- 一切都写成幂等的。用 `create table if not exists` 和 `create index if not exists`。用 `create or replace function` 和 `add column if not exists`。万一我搞不清楚哪些已经跑过了，我应该可以重跑一个文件而不造成损坏。
- 每个文件结尾都把自己记进 `gftvjobs_migrations` 表，记下文件名和应用时间，这张表由 `001` 创建。那张表就是跑过什么的记录，因为没有任何自动化的东西在追踪它。
- 在每个文件末尾放一段被注释掉的回滚区块，这样撤销一个迁移是复制粘贴，而不是重新拼出来。
- **绝不要改一个已经跑过的文件，也绝不要重新编号。**要改就变成一个新的编号文件。即使在开发过程中也照样，因为从第 3 阶段起生产环境就是活的。
- 每个文件都小到可以舒服地贴进 SQL 编辑器。该拆就拆，而不是让一个文件越长越大。
- `migrations/README.md` 按顺序列出每一个文件，各配一行说明它做什么。它也带着运行说明，以及不要改已应用文件那条规则。

新增的表：

- `gftvjobs_users`：id uuid pk、username text unique not null、display_name text not null。然后是 email text unique not null、password_hash text not null、avatar_url text null。然后是 phone text null、totp_secret text null、is_active boolean default true、created_at、updated_at。
- `gftvjobs_sessions`：id uuid pk、user_id uuid references `gftvjobs_users` on delete cascade。然后是 token text unique not null、expires_at timestamptz not null、created_at。在 token 和 user_id 上建索引。
- `gftvjobs_departments`：id、name、slug unique、description、sort_order、is_active。
- `gftvjobs_jobs`：id uuid pk、slug text unique、title、department_id、summary。然后是 description（markdown 或 html）、responsibilities、requirements、nice_to_have。然后是 commitment_type（例如全职、兼职、义工、合约、实习）、location、is_remote boolean。然后是 compensation_note text null、openings int、status text check in (draft, published, closed, archived)。然后是 application_form_url text null、form_prefill jsonb null、response_sheet_url text null。然后是 published_at、closes_at timestamptz null、created_by uuid references `gftvhello_users`、created_at、updated_at。在 status、department_id、slug、closes_at 上建索引。
  - `closes_at` 可以为空，是刻意的。为空表示这个职位没有截止日期，一直开着直到管理员关掉它，用在长期招或者随时招的角色上。把空当作开着，绝不要当作过期，也绝不要图省事把它合并成一个很远的未来日期。
  - 那个 id 就是公开详情页网址所用的，所以它在这里是一个真正的标识符，而不只是一个内部主键。
  - `application_form_url` 是申请按钮打开的那份 Google 表单。它是**可以为空**的，由一个表级检查约束挡住没有它就发布的情况。那个约束是 `check (status <> 'published' or application_form_url is not null)`。
  - 可以为空是刻意的，不是疏忽。职位必须先存在，表单才能配置。第 13 节需要职位的 uuid，才能在表单的脚本属性里设 `JOB_ID`。一个 `not null` 的列会逼管理员为了保存草稿而胡诌一个占位地址。而一个一路活到发布的占位地址，就是一个指向不存在之处的申请按钮。那会在申请人那一端悄悄失败，而不是在管理员这一端大声报错。
  - 所以工作的顺序是：先起草职位、复制 uuid、做表单、把地址贴回来、发布。第 8 节写的是同一个顺序。
  - `form_prefill` 可选地把 Google 表单的 entry ID 对应到申请人的字段。举个例子是 `{"entry.123456": "email", "entry.789012": "display_name"}`，这样本平台就可以在表单地址后面接上预填的查询参数。
  - `response_sheet_url` 是一个可选的链接，指向所关联的 Google 表格，只给管理员看。
- `gftvjobs_applications`：这是一条追踪记录，不是申请本身，因为答案在 Google 表单里。列有：id uuid pk、job_id references `gftvjobs_jobs`、applicant_id references `gftvjobs_users`。然后是 status text check in (started, submitted, under_review, shortlisted, interview, offered, accepted, rejected, withdrawn) default `started`。然后是 admin_note text null、started_at、applied_at timestamptz null、cooldown_until timestamptz null、updated_at。
  - 依 7f，`applied_at` 和 `cooldown_until` 在申请被确认时设置。记录还停在 `started` 时两者都为空，撤回时两者都清掉。在 (job_id, applicant_id) 上有一个唯一约束，所以每位申请人对每个职位只有一条追踪记录。重复点申请只会更新 `updated_at`，而不会插入重复的记录。
- `gftvjobs_application_events`：id、application_id、from_status、to_status、note。然后是 changed_by uuid references `gftvhello_users`、created_at。每一次状态变更都在这里写一条记录。
- `gftvjobs_analytics`：id uuid pk、job_id references `gftvjobs_jobs` on delete cascade。然后是 applicant_id references `gftvjobs_users` on delete set null、event_type text check in (view, apply_click)。然后是 did_apply boolean not null default false、response_state text check in (pending, answered, no_response) default `pending`。然后是 answer_source text check in (applicant, webhook, admin, timeout) null、responded_at timestamptz null。然后是 referrer text null、created_at timestamptz default now()。在 job_id、applicant_id、event_type 和 created_at 上建索引。在 `response_state` 为 `pending` 的地方加一个部分索引，这样查还没回答的提示就很便宜。
  - 一次申请点击一条记录，而不是一位申请人一条。对同一个职位的第二次点击是第二条记录，正是这一点让整条漏斗有意义。
  - `did_apply` 默认是 false，只有在得到肯定的确认时才会变成 true。那要么是申请人点了“是”，要么是第 13 节的那个回调。没有回答不是一个缺失的值，它就是“否”。绝不要在这里用空来表示没回答；那由 `response_state` 承担。
  - `event_type` 为 `view` 是职位详情页上可选的浏览记录。每个会话对每个职位只记一次，绝不是每次渲染都记。管理员预览草稿时绝不记录浏览。
  - 不存 IP 地址，也不存原始的 user agent。要知道流量从哪里来，referrer 就够了。
  - 这张表是只追加的事件日志。`gftvjobs_applications` 仍然是每位申请人对每个职位唯一那条去重后的状态记录。在同一个请求里让两者保持一致，绝不要靠改写其中一个来推导另一个。
- `gftvjobs_ratings`：id uuid pk、job_id references `gftvjobs_jobs` on delete cascade。然后是 applicant_id references `gftvjobs_users` on delete cascade、rating smallint not null check between 1 and 5、created_at、updated_at。在 (job_id, applicant_id) 上唯一，所以第二次评分是更新第一次，而不是叠加上去。评分只给管理端看，绝不显示在公开的职位上。一个看得到的分数，会让人不敢去申请那些被少数几个人打了低分的职位。
- `gftvjobs_tasks`：id uuid pk、applicant_id references `gftvjobs_users` on delete cascade。然后是 job_id references `gftvjobs_jobs` on delete set null、application_id references `gftvjobs_applications` on delete set null。然后是 task_type text not null default `info_request`、title text not null、body text null。然后是 status text check in (open, awaiting_admin, resolved, dismissed) default `open`。然后是 response_text text null、responded_at timestamptz null。然后是 raised_by uuid references `gftvhello_users` on delete set null、resolved_by uuid references `gftvhello_users` on delete set null。然后是 resolved_at timestamptz null、created_at、updated_at。在 (applicant_id, status) 和 job_id 上建索引。
  - `task_type` 是带默认值的纯文本，而不是一个很紧的检查约束，这样加一种新类型不需要迁移。
  - 申请人回复会把记录移到 `awaiting_admin`。只有管理员能把它移到 `resolved`。
  - 没回答的申请提示绝不会出现在这张表里。依 7g，它们是从 `gftvjobs_analytics` 推导出来的。
  - 为了 7g 的问题集，它加上 `questions jsonb null` 和 `answers jsonb null`。两者都放在事项记录上，而不是各自开一张表。这样做恰恰是对的，因为回复模型只有一个来回：一个问题只属于一个事项，一个答案也只属于一个问题。所以没有什么要连接的，跨记录也没有什么要排序的。职位上的 `sections` 和 `form_prefill` 在这个结构里已经是同一种写法。如果回复模型哪天变成一个会话串，这些就会变成表。那和做一套消息系统是同一个决定，不是一个更小的决定。
  - `questions` 是一个有序数组。每一项带一个 `id`，在该事项内唯一且稳定，因为答案是以它为键的。它还带一个 `type`，是 `short_text`、`long_text`、`choice`、`checkbox` 之一。然后是 `required` 布尔值，以及一个按语言为键的 `label` 对象。两种列表类型还带 `options`，是一个 `{ value, label }` 的有序数组。其中 `value` 是与语言无关的标识符，`label` 同样按语言为键。
  - **答案存的是选项的值，绝不是标签。**`answers` 是一个以问题 id 为键的对象。两种文本题存一个字符串，`choice` 存一个选项的 `value`，`checkbox` 存一个 `value` 的数组。存标签会让一个用华文给出的答案在英文下读不懂，也没办法和选项对上。
  - 问题的 id 和选项的值就是那个连接点，所以**两者都绝不可以被重用或重新编号**。依 7g，事项一发出去它们就冻结了。
  - 用按语言为键的对象，而不是翻译记录，和迁移 `018` 里的 `gftvjobs_settings` 一致。依 3a，加一种语言仍然只是一个词典文件和一行语言记录，这里也不用改结构。
  - `response_text` 保留，它就是那个自由文本框。它总是和问题一起提供，绝不会被问题取代。一个 `questions` 为空的事项，表现得和这个功能出现之前发起的事项完全一样，正是这一点让表里已有的记录仍然有效。
  - 把结构约束到写不进一条畸形记录的程度。`questions` 要么是数组要么为空，`answers` 要么是对象要么为空。其余的校验是接口的事，因为它需要把答案和问题比对，而检查约束做不到。
- 依 7g，`gftvjobs_jobs` 加上 `task_questions jsonb null`，也就是往后每一个申请该职位的人都会被问到的那一套。结构和 `gftvjobs_tasks.questions` 相同。它是一个模板，绝不是记录本身。发起一个事项时会把它**复制**到事项记录上，所以每位申请人那一套都是各自独立冻结的。改动职位上那一套，只会改变下一位申请人被问到什么。为空表示这个职位除了那两个内建问题之外什么都不问，而那是常见的情况。
- `gftvjobs_2fa_backup_codes`：id uuid pk、user_id references `gftvjobs_users` on delete cascade、code_hash text not null、created_at。在 user_id 上建索引。一个码一条记录，用掉就删。只在登录的第二重验证那一步被接受。
- `gftvjobs_recovery_codes`：id uuid pk、user_id references `gftvjobs_users` on delete cascade、code_hash text not null、created_at。在 user_id 上建索引。一个码一条记录，用掉就删。只在忘记密码的流程里被接受。
  - 是两张表，而不是一张带用途列的表。这个分隔本身就是那个安全属性，所以要把它做成结构上的。对其中一张的查询绝不可能碰巧满足另一张，也没有一个用途值可以在 where 条件里写错。
  - 这个项目里的每一张表都毫无例外地带 `gftvjobs_` 前缀，包括这两张。不会在那个命名空间之外新建任何东西。
- `gftvjobs_password_resets`：id uuid pk、user_id references `gftvjobs_users` on delete cascade。然后是 ticket_hash text not null、browser_nonce_hash text not null。然后是 expires_at timestamptz not null、used_at timestamptz null、created_at。短时有效、只能用一次，而且只有在验过一个有效的救援码之后才发出。
- `gftvjobs_trusted_devices`：id uuid pk、user_id references `gftvjobs_users` on delete cascade。然后是 device_token_hash text not null unique、label text null、last_used_at timestamptz null。然后是 created_at、expires_at timestamptz not null default (now() + interval '30 days')。在 user_id 和 device_token_hash 上建索引。

Passkey，来自迁移 `025`。记在这里，是因为 5e 是事后才写的，而这些表已经存在了：

- `gftvjobs_passkeys` 和 `gftvjobs_staff_passkeys`：一个凭证一条记录。每一条存凭证 id、公钥、签名计数、一个 aaguid，以及一份传输方式列表。然后是用户自己起的标签、`created_at` 和 `last_used_at`。是两张表，而不是一张带体系列的表，各自对自己那套体系的用户表有一个真正的外键。`gftvjobs_staff_passkeys` 引用 `gftvhello_users`，而且和其他每一处引用一样，绝不会往回写。
- `gftvjobs_passkey_challenges` 和 `gftvjobs_login_challenges`：共用、短时有效、只能用一次。

说明文件网站和员工救援，从迁移 `028` 起陆续到来：

- `gftvjobs_docs_sessions`：id uuid pk、staff_user_id uuid references `gftvhello_users` on delete cascade。然后是 token text unique not null、expires_at timestamptz not null、created_at。在 token 和 staff_user_id 上建索引。依 5h，它为另一套体系和另一个网站，照 `gftvjobs_sessions` 的样子做。它和 `gftvhello_sessions` 是分开的，所以一次说明文件网站的登录绝不会被误认成一次 gftv.asia 的登录。它也和平台那边任何员工会话分开，所以登出其中一个网站不会把你从另一个登出。
- `gftvjobs_staff_recovery_codes`：id uuid pk、staff_user_id references `gftvhello_users` on delete cascade、code_hash text not null、created_at。在 staff_user_id 上建索引。一个码一条记录，用掉就删。依 5g，只在员工忘记密码的流程里被接受，绝不在第二重验证那一步。
- `gftvjobs_staff_password_resets`：id uuid pk、staff_user_id references `gftvhello_users` on delete cascade。然后是 ticket_hash text not null、browser_nonce_hash text not null。然后是 recovery_code_id uuid references `gftvjobs_staff_recovery_codes` on delete cascade、second_factor_at timestamptz null。然后是 expires_at timestamptz not null、used_at timestamptz null、created_at。申请人那一张是经过迁移 `024` 和 `027` 才长成这个样子的。员工这一张一开始就把两个列都做上，不要把那个教训再学一遍。
- `gftvjobs_docs_translations`：id uuid pk、page_path text not null、locale text references `gftvjobs_locales`。然后是 title text、summary text、body text、is_ready boolean not null default false。然后是 updated_by uuid、updated_at、created_at。在 (page_path, locale) 上唯一。依 16e 和 16f，它就是 3a 那套“基准行加翻译行”的结构用在指南上。markdown 文件是基准行，并且带着 `access` 键，那个键绝不在这里。一行只有在 `is_ready` 被设了之后才会显示，而没有可用翻译行的页面会退回英文并附上提示。第 14 阶段创建它。
- `gftvjobs_docs_pages`：page_path text pk、title text not null、summary text null、body text not null、updated_at timestamptz not null。只由 `docs-site/scripts/build.js` 在部署时写入，也只由 Telegram 机器人的 `/docs` 读取。2026 年 9 月 3 日加的，因为 16e 把英文留在文件里，而机器人要读的是 Supabase。没有它，机器人对每一页都有华文的正文，却完全没有英文的。文件仍然是事实来源，没有任何东西会手动改一行。**只放公开页面，而且没有 `access` 列。**受限页面绝不会进到这张表，正是这一点让门只有一处，即使多了一个读指南的消费方。构建过程会拒绝把受限页面写进这里，就像它已经拒绝把受限页面渲染进 `dist/` 一样。第 14 阶段创建它。

没有任何一张表存着哪一页需要哪一个角色。那件事存在每一页的 front matter 里，而提供内容的那个函数本来就会读它，依 16f。一张表就得在构建时写入。那样它就成了同一个事实的第二份副本，可以随时和它所描述的文件不一致。`gftvjobs_docs_pages` 不是这条规则的例外。它不存任何权限层级，它之所以存在，是因为一个没有任何表提到的页面，就是 Vercel 之外任何东西都读不到的页面。

- `gftvjobs_telegram_links`：id uuid pk、applicant_id references `gftvjobs_users` on delete cascade unique。然后是 telegram_user_id bigint not null unique、telegram_username text null、telegram_display_name text null。然后是 twofa_enabled boolean not null default false、linked_at timestamptz default now()、last_notified_at timestamptz null。一个 Telegram 账户关联一个平台账户，反之亦然。
- `gftvjobs_telegram_tokens`：id uuid pk、applicant_id references `gftvjobs_users` on delete cascade。然后是 token_hash text not null、purpose text check in (link, login_code, magic_link)。然后是 expires_at timestamptz not null、used_at timestamptz null、attempts int default 0。然后是 browser_nonce_hash text null、created_at。在 (applicant_id, purpose) 和 expires_at 上建索引。存哈希，绝不存验证码或令牌本身。
- `gftvjobs_invites`：id uuid pk、job_id references `gftvjobs_jobs` on delete cascade。然后是 applicant_id references `gftvjobs_users` on delete cascade、invited_by uuid references `gftvhello_users` on delete set null。然后是 note text null、status text check in (invited, seen, applied, declined, withdrawn) default `invited`、created_at、updated_at。在 (job_id, applicant_id) 上唯一。
- `gftvjobs_notifications`：id uuid pk、applicant_id references `gftvjobs_users` on delete cascade。然后是 kind text not null、payload jsonb not null。然后是 status text check in (queued, claimed, sent, failed, skipped) default `queued`。然后是 claimed_at timestamptz null、sent_at timestamptz null、error text null、attempts int default 0、created_at。在 (status, created_at) 上建索引。依第 15 节，这就是 Telegram 机器人负责发送的那个发件箱。
- `gftvjobs_saved_jobs`：id、applicant_id、job_id、created_at，在这一对上唯一。职位关闭或过期时这些记录仍然保留。只有在申请人取消收藏、或者职位被硬删除时才会移除。
- `gftvjobs_tags`：id uuid pk、name text not null、slug text unique not null。然后是 colour text null、description text null、usage_count int default 0、created_at。slug 是小写加连字符，由名称生成。在 name 上强制不分大小写的唯一性，这样 “Video Editing” 和 “video editing” 不能同时存在。
- `gftvjobs_job_tags`：job_id references `gftvjobs_jobs` on delete cascade、tag_id references `gftvjobs_tags` on delete cascade。主键就是这一对，两个列上都建索引，好让两个方向的筛选都快。
- `gftvjobs_status_days`：target text not null、day date not null、checks int not null default 0。然后是 failures int not null default 0、duration_total_ms bigint not null default 0、slowest_ms int null。然后是 first_checked_at timestamptz not null、last_checked_at timestamptz not null。主键是 (target, day)。每个目标每个 UTC 日一条记录，记的是观察了多少次，而不是把每一次检查都存下来。**那些计数就是让这个页面保持诚实的东西。**一天带着自己被测量了多少，所以一个几乎没被观察的日子就画成只测了一部分。一个没人探测过的日子根本没有记录，绝不会是一条全是零的记录。
- `gftvjobs_status_incidents`：id uuid pk、target text not null、started_at timestamptz not null。然后是 last_failed_at timestamptz not null、ended_at timestamptz null。然后是 failures int not null default 1、status_code int null、error text null。在 ended_at 为空的地方，对 (target) 建一个唯一的部分索引，这样一个目标最多只有一次未结束的故障。一次故障一条记录，由第一次失败的检查打开，由它之后第一次成功的检查关闭。所以一次持续很久的故障是一条不断增长的记录，而它的结束是观察到的，绝不是推断出来的。
- `gftvjobs_status_record(p_checks jsonb)`：进这两张表的唯一途径。一个周期的结果作为一个数组一次送进来。这个函数把日计数加上去，并打开、延长或关闭故障记录，这样 VPS 上就不需要先读再写。它对 anon 和 authenticated 收回权限，只按名字授予 service_role。一个默认每个角色都能执行的函数，就是一条让人替别人的网站写历史的路。
- **这两张表只由第 15 节那个 VPS 上的探测程序写入，平台绝不写。**它们只由 0c 的状态页读取。保留九十天历史，由第 11 节的每日定时任务清理；一次仍未结束的故障绝不会被清掉。这是整个结构里仅有的、写入方刻意放在 Vercel 之外的表。一个跑在被探测对象自己身上的探测程序，报不了它本来就是为之而存在的那次故障。

  **2026 年 8 月 31 日在第 12 阶段第 7 部分改过。**原本这是一张表，每一次请求一条记录。那大约是一天六千条，在这个页面所画的窗口里就是五十万条。其中几乎每一条记录的都是什么都没发生。上面这个结构一天只花四条记录，外加偶尔一次故障。它说出来的是真正的故障时长，而不是一个下限：只有失败停下来，一串失败才会被结束。

多语言内容，依 3a。这些从迁移 `014` 起陆续到来，而不在最初的表定义里，因为前十三个已经提交了。**默认语言的内容放在基准行上；其他每一种语言都是翻译表里的一行。**所以加马来文或淡米尔文完全不用改结构：

- `gftvjobs_locales`：code text pk、english_name、native_name、html_lang。然后是 text_search_config text null、is_default boolean、is_active boolean、sort_order、created_at。
  - `text_search_config` 指定一个 Postgres 的文本搜索配置。当 Postgres 分不了这种语言的词、搜索必须退回三元组匹配时，它为空。正是这一点让 `016` 里的搜索函数与语言无关，而不用把哪些语言比较麻烦写死在里面。
  - 一个唯一索引只允许恰好一个默认语言。默认语言的内容在基准行上，而一个检查约束禁止为它建翻译行。
- `gftvjobs_job_translations`：job_id、locale、title、summary、description。然后是 responsibilities、requirements、nice_to_have、location、compensation_note。然后是 sections jsonb、og_description、application_form_url、form_prefill、response_sheet_url。然后是 is_ready boolean、search_text generated、created_at、updated_at。主键是 (job_id, locale)。
  - **一种语言可以指向它自己的申请表。**有些职位是每种语言各跑一份表单，而不是一份双语表单。所以 `application_form_url` 在这里可以为空，为空时退回用职位上的那一个。`form_prefill` 和 `response_sheet_url` 跟着它走，因为不同的表单有不同的 entry id 和不同的回复表格。
  - **一份翻译只有在 `is_ready` 被设了之后才会显示。**这让“翻好了但还没校”成为一个真实存在的状态，而不是从哪几个字段刚好填了什么去推断。依 7i，正是它让一个帮手可以先起草而不发布。
  - 没有该语言的名称、摘要和描述，`is_ready` 就设不了。那三个字段是读者真正会读的，而缺了其中任何一个的翻译，读起来就是一个翻好的标题压着一段没翻的正文。可选的字段会静静地退回用职位上的；8.11 的清点会把那些显示出来。
  - 任何留空的字段都退回用基准行，所以一份翻译不必把没改动的东西再抄一遍。
- `gftvjobs_department_translations` 和 `gftvjobs_tag_translations`：那一行的 id、locale、name、description。slug 是共用的，而且**绝不翻译**，因为它是一个网址标识符，也是一个筛选值。
- `gftvjobs_translation_helpers`：user_id、locale、note、granted_by、granted_at。依 7i。主键是 (user_id, locale)，所以这个角色是按语言授予的。
- 依 0c 和 8.12，`gftvjobs_settings` 加上 `feature_overrides`。它是一个以功能键为键的对象。每一个值带着状态、一段可选的对外说明、什么时候设的，以及谁设的。没有它或者它是空的，就表示所有已上线的功能都开着，而那是常见的情况。它是一个设置而不是一张表，因为它顶多也就是几条，而且每次打开页面都要读。`api/_lib/settings.js` 本来就把设置缓存一分钟，而那对这件事来说正是恰当的陈旧程度。一次故障切换在一分钟内传到所有人已经够快了，而每个请求都去读一张表并不够快。
- 依迁移 `018`，`gftvjobs_settings` 里存着人看的文字的值，变成按语言分的对象 `{"en": ..., "zh": ...}`。不存文字的设置保持它们本来的形状。一份精选职位清单如果会因语言而不同，那是缺陷而不是功能。
- 依 `020`，`gftvjobs_users` 加上 `locale`。`localStorage` 帮不了 Telegram 机器人，因为它是主动发起对话，而不是回答对话。所以一位已登录申请人的选择要记在账户上，供服务器主动发出的任何东西使用。
- 依 `019`，`gftvjobs_jobs` 加上 `sections` jsonb；依 `017` 加上 `og_description`。依 `021`，`commitment_type` 变成五个键的受控清单，在词典里翻译，绝不按语言分别存储。

- `gftvjobs_translation_reports`：id uuid pk、target_type text check in (job, department, tag, interface)。然后是 target_id uuid null、target_key text null、field text null、locale text check in (en, zh)。然后是 reporter_id uuid references `gftvjobs_users` on delete set null、note text not null、suggested_text text null。然后是 status text check in (open, accepted, rejected, fixed) default `open`、resolution_note text null。然后是 resolved_by uuid references `gftvhello_users` on delete set null、resolved_at timestamptz null、created_at、updated_at。
  - 账户被删除时 `reporter_id` 设为空，绝不级联删除。一条促成了修正的反馈，就是那句措辞为什么会改的记录。
  - 一个约束要求，一条记录要走到 `rejected` 或 `fixed` 之前，必须先有处理说明和时间戳。所以一条反馈不可能在没有可追责痕迹的情况下离开队列。
  - 依 7h，反馈不是事项，绝不会出现在 `gftvjobs_tasks` 里，也不会出现在 `/account/tasks` 的徽章数量里。

搜索支持：

- 在 `gftvjobs_jobs` 上加一个 `search_vector tsvector` 列，用生成列或触发器维护。名称给 A 权重，标签和部门给 B，摘要给 C，长正文那几个字段给 D。用 GIN 建索引。
- 标签和部门的名称在别的表里。所以用一个触发器来维护这个向量，它在 `gftvjobs_jobs` 插入或更新时触发，也在 `gftvjobs_job_tags` 变动时触发。把那些触发器函数放在搜索那个迁移文件里。
- 启用 `pg_trgm` 扩展，并在 `gftvjobs_jobs.title` 和 `gftvjobs_tags.name` 上加三元组索引，给拼错兜底和自动补全用。
- 用同一个触发器把 `gftvjobs_tags.usage_count` 维护准确，这样每次渲染标签云都不必去连表算数量。
