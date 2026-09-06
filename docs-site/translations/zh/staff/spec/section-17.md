---
title: 17. 交付内容
---

# 17. 交付内容

- 一个照上面结构做好、能正常运行的完整代码库。
- `migrations/` 目录，里面有每一个编号的 SQL 文件、它的 README，以及各自的回滚区块。
- 两个网站上的 `sitemap.xml`、`robots.txt` 和 `llms.txt`，依第 4 节。
- 根目录 README，讲清楚安装、环境变量和 Supabase 设置。然后是 Vercel 部署，以及 `careers.globalfurry.tv` 的自定义域名设置。
- 第 2 节指定的 `main-site/.env.example`，每一个变量上面都有一句注释说明去哪里拿。
- 第 2 节写的那四个 README，每个阶段都保持更新。
- 一个种子脚本，带几个示例部门和职位，方便本地测试。
- 依第 15 节的 `telegram-bot` 目录，带自己的 README、setup.md、.gitignore 和 .env.example，逐个文件交付。
- 依第 0b 节，每个阶段都保持更新的 `next-steps.md`，并且不入库。
- 依第 0c 节，每次阶段上线时都保持更新的 `build-status.json`。
- 依第 16 节的 `docs-site` 目录，带自己的 README 和自己的 `.env.example`。它有自己的 `api/` 和依 5h 的员工登录，以及依 16a 的角色权限。然后是依 16h 的四本指南、Playwright 截图脚本，以及截图清单。
- 依 5f 的员工账户设置套件和它的危险操作区，只做一份，挂在两个网站上，另加依 5g 的员工账户救援码。
- `assets/i18n/` 词典，每种语言的键都要一一对应，以及依 3a 的语言表和翻译表。
- 依 8a 的 `/admin/docs` 跳转。平台内不做管理说明文件，也不要 `main-site/api/_admin-docs/`。
- README 里放一份简短的离线测试清单。装好这个应用，打开职位板，然后断网。浏览一个已缓存的职位、给它评分、回答那个弹窗。再连回网络，确认队列已经发出去了。
- 逐个文件交付，绝对不要打包成压缩档。
