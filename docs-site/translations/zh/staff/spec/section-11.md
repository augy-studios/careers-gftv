---
title: 11. 定时维护
summary: 加一个每天运行一次的 Vercel 定时任务：
---

# 11. 定时维护

加一个每天运行一次的 Vercel 定时任务：

- 自动关闭任何 `closes_at` 不为空且已经过期的 `published` 职位，把状态设为 `closed` 并写一条审计记录。`closes_at` 为空的职位完全跳过，永远不会被自动关闭。
- 用 HEAD 或轻量的 GET 检查每个已发布职位的 `application_form_url` 是否正常。表单有可能被删掉、被设为私密，或者已经不再接受回复。请在管理列表里给该职位加一个警告标记，而不是悄悄把它下架。
- 把超过 14 天仍是 pending 的 `gftvjobs_analytics` 记录改为 `no_response`。
- 删除 `gftvjobs_sessions`、`gftvjobs_trusted_devices`、`gftvjobs_password_resets`、`gftvjobs_telegram_tokens` 里过期的记录，以及过期的 `gftvhello_totp_challenges`。除了正常的过期清理之外，不要动属于其他平台的 `gftvhello_sessions` 记录。
- 删除超过九十天的 `gftvjobs_status_days` 记录。删除在那之前开始**并且已经结束**的 `gftvjobs_status_incidents` 记录，等第 12 阶段建好这两张表之后再做。仍未结束的事件不论多久都不清理：就这里所知，它仍然是那个目标当前的状态。这个清理量本来就很小，一天四条记录。之所以要做，是因为那个页面正好只画九十天，再旧的都是没人看的负担。
- 在管理总览上显示定时任务最后一次运行的时间和结果。
