---
title: 3. Design
access: developer
order: 6
summary: The portal is available in English and Chinese.
---

# 3. Design

- Follow `gftv-theme.md` exactly. That is Proxima Nova, the GFTV branding font, self hosted under `assets/fonts/`. Then the `.glass-card` primitive, and the tokens `--brand`, `--brand-dark`, `--surface` and `--text`, in GFTV blue-grey, Hello yellow, and GFTV red for links. Links carry no underline in any state. A link inside body copy is one weight step heavier than the text around it, and that is what identifies it.
- Two-axis theme switcher (colour theme plus light/dark mode) using `data-color-theme` and `data-mode` on `<html>`, same as the other GFTV apps. Light mode is the default and ignores OS preference.
- No gradients, orbs, or blobs. Inline SVG icons, never emoji. No em dashes in copy.
- WCAG AA contrast for all text and body copy in every theme and mode combination.
- **Anything that waits shows that it is waiting.** Never a frozen screen and never a bare empty container. Use the loading primitives in `gftv-theme.md`. That is a spinner where the result has no shape yet, and skeletons where the shape is known. Both carry the 250ms delay, so a fast response is never seen to load at all. Pair every indicator with text a screen reader can announce, since an animation announces nothing. This applies to the search results, a posting loading, the apply handoff, and every admin table.
- Mobile first, not desktop with a phone afterthought. Both the portal and the docs site in section 16 must be fully usable on a small screen. Phase 12 checks that, so it is never assumed.

### 3a. Languages: English, Mandarin, and whatever comes next

The portal is available in English and Chinese. Only one language is shown at a time. This is not a partial translation of a mostly English site. Every posting, every interface string, every static page, and the admin dashboard exist in both.

**The Chinese is Singapore Mandarin**, 华文, not Mainland Putonghua. GFTV is a Singapore organisation and the copy should read as though it were written there. That is a vocabulary matter more than a grammar one, and the differences are real:

| Use | Not | Meaning |
|---|---|---|
| 义工 | 志愿者 | volunteer, and the single most visible marker |
| 华文 | 中文, 简体中文 | the written language, when naming it |
| 电邮 | 电子邮件 | email |
| 营运 | 运营 | operations |
| 摄影棚 | 录影棚 | studio |
| 文件 | 文档 | document, in the paper sense |

The language names itself 华文 in the switcher. The document is tagged `zh-Hans-SG` and not `zh-Hans`, since that is what the copy actually is. Prefix matching means anything keyed on `zh` or `zh-Hans` still applies. The font stack lists Simplified Chinese faces only: a traditional face would render the wrong character forms where the two sets differ.

When adding copy, check it against that table. When in doubt, the test is whether it would read naturally in the Straits Times, as opposed to a Beijing newspaper.

**The switcher.** A language control in the header, working exactly like the theme switcher and sitting beside it. It is its own button with a globe icon, and never a section inside the theme modal. A reader who only reads Mandarin and lands on the English site cannot be expected to find a control labelled "Theme". A globe is legible without reading anything. Each language names itself in its own script, `English` and `华文`, and neither is ever translated. So both options read the same whichever language the interface is currently in.

**Storage.** The choice lives in `localStorage` under `gftv-careers.locale`, alongside the two theme keys, and nowhere else. A pre-paint script in every `<head>` sets `lang` and `data-locale` on `<html>` before first paint, in the same block that sets the two theme attributes.

**The language is deliberately not in the URL.** Three consequences follow, and they are accepted and not worked around:

- A link shared by a Mandarin reader opens in whatever language the recipient has stored.
- Search engines only ever see the English version of a page. So `sitemap.xml`, the canonical tag, and the `JobPosting` JSON-LD in section 4 describe the English posting only. Mandarin postings are not discoverable through Chinese-language search, and Google Jobs will carry the English text.
- `hreflang` cannot be emitted, since there is no second URL to point at.

If any of that becomes a problem, the fix is a `?lang=` parameter carried alongside the stored preference. That is additive and would not change the schema.

**Interface strings.** Held in `main-site/assets/i18n/en.json` and `zh.json`, flat dotted keys, applied through `data-i18n`, `data-i18n-html`, and `data-i18n-attr` attributes. English is always loaded as the fallback layer. So a key missing from the Chinese file renders English, and never a blank element or a raw key. The English text stays in the markup as the element's own content, so a page reads correctly with no JavaScript and before the dictionary resolves.

**Content.** The default language lives on the base rows, and every other language is a row in a translation table keyed by locale. That shape is why adding Malay or Tamil costs a row in `gftvjobs_locales` and a dictionary file, and never a migration. A column per field per language would have cost ten columns and a fresh set of constraints each time. A translation is shown only when its `is_ready` flag is set. A drafted or unreviewed one can then sit in the table without going live. Any blank field falls back to the base row. A posting may publish with no translation at all, and it then reads in the default language with a notice saying so. But a translation marked ready must carry a title, summary, and description in that language. A translated heading above an untranslated body is worse than plainly untranslated. Tag and department slugs are **not** translated. They are URL identifiers and filter values, and translating them would break every shared link the moment somebody switched language.

**Search.** Languages are searched differently depending on whether Postgres can tokenise them, and have to be. Postgres cannot segment Han script. So `to_tsvector` treats a run of Han characters as one token, and a search for part of a word never matches. `zhparser` and `pg_jieba` would fix that and are not available on Supabase. English therefore keeps the weighted `tsvector`, ranked with `ts_rank_cd` and highlighted with `ts_headline`. A language Postgres cannot tokenise is matched with `pg_trgm` against the generated `search_text` column on its translation row. That is ordered by title closeness, with no highlighted snippet. Both work; only English ranks well. Say so in the admin documentation, instead of letting an admin conclude Chinese search is broken.

**Typography.** Proxima Nova carries no CJK glyphs, so Han characters fall through to the reader's own system font. That is PingFang SC on Apple platforms, Microsoft YaHei on Windows, and Noto Sans CJK SC on Android and Linux. No CJK face is named in the stack, deliberately. The platform defaults are already the right faces. Naming them would override a reader who has chosen a different Chinese font in their own settings. What makes this correct is the `lang` attribute, and not the stack. Han characters are shared between Chinese and Japanese, and a browser with no language to go on may render Chinese text in a Japanese face. A number of shared characters are drawn differently there. Every page sets `lang` from the stored locale before first paint. If that ever stops happening, the Chinese renders with the wrong glyph forms while nothing else looks broken. The Chinese document also gets a slightly looser line height, scoped to `[data-locale="zh"]`, since Han script reads tight at the leading Latin copy wants.

**Names.** GFTV is **国际兽视** in Mandarin, and the portal is **国际兽视入队平台**, literally the portal for joining the team. Use those, not the English strings, anywhere Chinese is being read. **The Mandarin name is not a translation of "Careers" and is deliberately not one.** "Careers" implies a salary, which is why every posting has to say it is unpaid, and 招聘 would carry that implication into Chinese. 入队 says what is actually on offer. A space sits between Latin and Han characters, and never between Han and Han. So it is `Telegram 账户` and `关于国际兽视入队平台`, with no space inside a run of Han.

**What is not translated.** Tag and department slugs, as above, since they are URL identifiers. `<noscript>` content, which cannot be reached once JavaScript is enabled.

This paragraph used to say that the staff half of the docs site stayed English. It asked for a note at the top of it saying so. **That was overruled by 16f on 3 September 2026 and built by phase 14 part 9**, which translated all eighty two pages. The whole documentation site is translated, staff half included. The correction is made here so that 3a and 16f cannot be read against each other. The link preview line on a posting stays English wherever it is shared, per 4 and the poster guide. The thing that unfurls a link has no language to offer.

### Responsive requirements

Applies to `main-site` and `docs-site` alike.

- Breakpoints: a single column layout below 640px, a relaxed two column layout from 640 to 1024px, and the full layout above 1024px. Design the small screen first and add columns upward, since retrofitting downward is what produces horizontal scrolling.
- **Hamburger navigation on both sites.** The portal collapses its header navigation and the admin sidebar behind a menu button. The docs site collapses its left sidebar behind one, and drops the right hand on-page contents into a collapsible block above the content. Same button behaviour and same animation on both, so they feel like one product.
- Every off canvas panel opens from the left and traps focus while open. It closes on Escape, on backdrop tap, and on navigating to a new page. It has an obvious close control and is reachable by keyboard. Set `aria-expanded` on the trigger and `aria-hidden` on the panel, and lock body scroll while it is open.
- The admin dashboard is not exempt. Tables reflow to stacked cards below 640px, instead of scrolling sideways. Bulk selection stays reachable, and any action buried in a wide table row surfaces in the card. An admin reading applications on a phone at a convention is the normal case here, not the edge case.
- The `/search` filter panel becomes a bottom sheet on small screens. The button that opens it carries the active filter count, and an apply action closes it.
- Touch targets are at least 44 by 44 CSS pixels with real spacing between them. Nothing depends on hover, and anything shown on hover has a tap equivalent.
- No horizontal scrolling at any width down to 320px. Long words, uuids, and tag names wrap or truncate with a title attribute, instead of pushing the layout.
- Modals, including the handoff modal in 7c, become full width sheets on small screens, with the buttons within thumb reach. They respect the safe area insets on notched phones.
- Forms use appropriate `inputmode` and `autocomplete` values, and inputs are at least 16px so iOS does not zoom on focus.
- Test at 320, 375, 414, 768, 1024, and 1440. Check both orientations, both themes, and both light and dark mode.

### 3b. Plain language, on both sites

Added 3 September 2026. **Every word on both sites is written for somebody with no technical knowledge who wants to find a role and apply for it.** That reader is the test, in English and in 华文 alike. It applies to the portal, the documentation site, the phase list on `/status`, and the bot's own messages.

What that means in practice:

- **One idea to a sentence, and no sentence over 25 words.** The cap is not the target: the portal's own average is under seven words. It exists to catch the sentence that grew three clauses while somebody was being careful, which is how the copy here fails when it fails.
- **Everyday words.** "Use up", not "consume". "Sign in", not "authenticate". Where a shorter word means the same thing, it is the word.
- **Name the technical term, then explain it.** Passkey, recovery code, two factor, cooldown: keep the word. It is the word on the button and in the browser's own prompt. Give it a plain explanation where the reader first meets it. Replacing the term would leave the page and the screen saying different things.
- **The reason belongs with the rule, still.** Plain does not mean thin: this site tells people why a thing works as it does, and that survives. It is said in shorter sentences.
- **The Chinese is Singapore Mandarin**, per 3a, and the vocabulary table there is a rule and not a preference.

`node check-copy.js` enforces the three parts of this a script can see: the banned phrases, the 25 word cap, and 3a's vocabulary table. Everything else is a judgement, which is why it is written here.
