---
title: 13. Google Apps Script 提交回调
summary: 这个要做。
---

# 13. Google Apps Script 提交回调

这个要做。代码量很小，而它把 `did_apply` 从一句自己报的话变成一条记录在案的事实。7c 的交接弹窗完全照原样保留，因为不是每一次提交都能对上号。两边说法不一致时，以这个回调为准。

### 它做什么

一个绑在每个职位的 Google 表单上的 Apps Script，会在提交时触发。它把答题者的电邮、职位 id 和回复 id 发给本平台。本平台用电邮去对上一条 `gftvjobs_users` 记录，并把该申请标记为确实已提交。

只发送电邮、回复 id 和时间戳。答案本身绝不离开 Google，这正好让本平台不碰申请内容，和第 10 节定下的一样。

### 平台这一端

加一张表：

- `gftvjobs_form_submissions`：id uuid pk、job_id references `gftvjobs_jobs`、form_response_id text not null。然后是 email text not null、submitted_at timestamptz not null。然后是 matched_applicant_id uuid references `gftvjobs_users` on delete set null、received_at timestamptz default now()。在 (job_id, form_response_id) 上加唯一约束，这样重发一次投递也是幂等的。

加 `POST api/webhooks/form-submit`，默认启用：

1. 用定时安全的比较，把 `x-portal-secret` 头和 `FORM_WEBHOOK_SECRET` 对一下。不一致就回 401，而且不要记录任何敏感内容。
2. 校验载荷的结构。任何格式不对的都回 400。
3. 插入 `gftvjobs_form_submissions`。如果唯一约束报错，回 200 然后结束，因为那是重复投递，不是错误。
4. 用电邮去查 `gftvjobs_users`，不分大小写。
5. 对上号之后，取该申请人在那个职位上最近的一条 `gftvjobs_analytics` 记录，不论它是待回答的、还是已经记成否或超时的。把它的 `did_apply` 设为 true、`response_state` 设为已回答，并记下来源是这个回调而不是申请人。把 `gftvjobs_applications` 的追踪记录移到 `submitted`。依 7f 设置 `applied_at` 和 `cooldown_until`，如果它们还没设的话，并写一条事件记录，把这次变更归给这个回调。如果根本没有分析记录，因为他们是从一个别人分享的链接进到表单的，那也照样把追踪记录建起来。
6. 对不上号时，`matched_applicant_id` 留空。把这条记录显示在管理分析页面的“未匹配提交”列表里，好让管理员手动关联。最常见的原因，是有人用了和注册时不同的电邮去申请。
7. 除了验证失败和校验失败之外，其他情况一律回 200。Apps Script 的重试很吵，回 500 对谁都没好处。
8. 对这个接口做限流，并限制载荷大小。

`gftvjobs_analytics` 上的 `answer_source` 记录这个答案是怎么来的。管理分析页面于是可以显示整条漏斗里有多少是自己报的、多少是确认过的。回调的确认会覆盖先前的否或超时，因为一次记录在案的提交，胜过沉默或者一次误点。

### 表单这一端

每个表单一份脚本，贴到 Google 表单的“扩展程序”再“Apps Script”里：

```javascript
// Set PORTAL_SECRET and JOB_ID in Project Settings, Script Properties.
function onCareersFormSubmit(e) {
  const props = PropertiesService.getScriptProperties();
  const answers = {};
  e.response.getItemResponses().forEach(function (r) {
    answers[r.getItem().getTitle()] = r.getResponse();
  });

  const payload = {
    job_id: props.getProperty('JOB_ID'),
    form_response_id: e.response.getId(),
    email: e.response.getRespondentEmail() || answers['Email'] || answers['Email address'] || '',
    submitted_at: e.response.getTimestamp().toISOString()
  };

  UrlFetchApp.fetch('https://careers.globalfurry.tv/api/webhooks/form-submit', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-portal-secret': props.getProperty('PORTAL_SECRET') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// Run once after copying the form.
function installCareersTrigger() {
  const form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onCareersFormSubmit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onCareersFormSubmit').forForm(form).onFormSubmit().create();
}
```

### 设置的成本，老实讲

代码很短。麻烦的地方在于表单提交的触发器是一个表单一个，所以每发一个新职位就要做一小步设置。把它控制在大约两分钟：

- 维护一份模板表单，脚本已经放在里面。绑在容器上的脚本会跟着表单副本走，所以复制模板就把代码带过去了。触发器不会跟着复制，这就是为什么要有 `installCareersTrigger` 让人跑一次。
- 每个新职位：复制模板、改题目、在 Script Properties 里把 `JOB_ID` 设成该职位的 uuid、跑一次 `installCareersTrigger`、授权。
- 把这份清单放进管理后台的职位编辑器，作为可折叠的说明文字，就在 Google 表单地址那一栏旁边。在那里显示该职位的 uuid 并附一个复制按钮，免得有人要到处去找。

### 兜底

- 如果某个表单一直没装这个回调，也不会坏掉什么。那个职位就只是靠申请人自己是或否的回答，而管理分析页面会把它的数字标成自己报的。
- 加一个管理操作，可以手动把一条追踪记录标记为已提交，用在电邮对不上号的情况。
- 把整套设置写进根目录 README，包括怎么轮换 `FORM_WEBHOOK_SECRET`。
