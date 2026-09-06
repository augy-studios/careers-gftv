---
title: 开发说明文件
summary: 给在建造这个项目的人之后接手的人。
---

# 开发说明文件

这是关于代码的指南。
它写给在建造国际兽视入队平台的人之后接手的人，
而且它假设您已经把代码库打开放在旁边。

**管理员就是这个项目的开发者。**
没有独立的开发者账户，也不要去发明一个，
所以只要您读得到[管理员指南](/staff/admin)，就读得到这一本。

## 本指南是什么，不是什么

**它解释各样东西的形状，并指向那个文件。**
凡是本项目自己拥有的文件，都会在这里完整重现。
凡是在国际兽视各个代码库之间流通的文件，本指南只会指向它，绝不复制它。

> [!NOTE]
> 一份会漂移的副本终究会漂移。
> 所以主题文件和官方横幅文件在这里只被指向，绝不重现：
> 本代码库里的那两份本身已经是副本了。

**它不是教程，也不是 API 参考。**
路由地图在 `main-site/README.md` 里，
每一个环境变量都记录在它旁边的 `.env.example` 里，
每一个迁移都列在 `migrations/README.md` 里。
那些文件之所以是最新的，是因为它们本身就是那次改动的一部分。

## 在您改动任何东西之前

这个构建里有五样东西，弄错了会默默失败。
每一样在这里都有一页，而且每一样都有一个脚本能抓到它。

| 如果您动了 | 就运行 |
|---|---|
| `main-site/api/_lib/` 或 `main-site/assets/js/` | `node gen-docs-lib.js --check` |
| `main-site/` 底下的任何东西 | 提升 `main-site/sw.js` 里的 `VERSION` |
| `docs-site/` 底下的任何东西 | 提升 `docs-site/sw.js` 里的 `VERSION` |
| 一个字典键 | `node check-i18n.js` |
| 任何读者看得到的英文 | `node check-copy.js` |

[值得不必重学的惯例](/staff/developer/conventions)是这一切的简短版。
如果您在这里只读一页，就读那一页。

## 本指南的内容

1. [从这里开始](/staff/developer/start-here)：
   两个网站、两个账户体系，以及代码库的形状。
2. [规格书](/staff/developer/the-specification)，
   也就是整个构建所要回应的那份说明。
3. [工作备忘](/staff/developer/the-working-memo)，
   以及为什么一个被 git 忽略的文件也是一项交付物。
4. [阶段与开发进度](/staff/developer/phases-and-build-status)：
   一个文件决定什么是开着的。
5. [官方横幅](/staff/developer/the-official-banner)，
   它会在最后取代开发中的提示。
6. [主题](/staff/developer/the-theme)：
   两个维度、各种符记，以及那些不是偏好的规则。
7. [头像储存桶](/staff/developer/the-avatars-bucket)，
   这个入队平台唯一储存的文件。
8. [数据库](/staff/developer/the-database)：
   命名空间、行级安全规则，以及怎么写一个迁移。
9. [身份验证](/staff/developer/authentication)：
   两个体系、通行密钥，以及各种恢复码。
10. [Vercel](/staff/developer/vercel)：一个代码库上的两个项目。
11. [Playwright](/staff/developer/playwright)，以及截图流程。
12. [测试脚本](/staff/developer/the-test-scripts)，您可以从那一页下载它们。
13. [服务工作线程](/staff/developer/the-service-worker)，两个网站都有。
14. [多语言层](/staff/developer/the-multilingual-layer)：
    基础记录、翻译记录，以及各个字典。
15. [Telegram 机器人](/staff/developer/the-telegram-bot)，
    它是唯一不在 Vercel 上的部分。
16. [值得不必重学的惯例](/staff/developer/conventions)。
