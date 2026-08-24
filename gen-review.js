// Builds zh-review.html: every translatable string in the portal, English
// beside Chinese, for review by a fluent Singaporean speaker.
//
//   node gen-review.js
//
// Reads the interface dictionaries, the seeded departments and tags from
// migration 014, and the hero copy from 018, then writes a single self
// contained page to the repo root.
//
// Single file on purpose, which is a deliberate departure from the split
// HTML, CSS, and JS used everywhere in main-site. That convention exists so a
// browser can cache one stylesheet across many pages; this page is served by
// nothing. It is attached to an email or a chat message and opened by a
// reviewer who is not a developer, so it has to survive being dragged out of
// a folder on its own, and it must render with no network. There is no
// JavaScript in the output at all.
//
// The output is gitignored. Regenerate it instead of editing it, and edit
// this file and not the HTML.

const fs = require('fs');
const path = require('path');
const repo = path.join(__dirname, '');
const out = path.join(repo, 'zh-review.html');

const en = JSON.parse(fs.readFileSync(path.join(repo, 'main-site/assets/i18n/en.json'), 'utf8'));
const zh = JSON.parse(fs.readFileSync(path.join(repo, 'main-site/assets/i18n/zh.json'), 'utf8'));
const sql = fs.readFileSync(path.join(repo, 'migrations/014_locales_and_translations.sql'), 'utf8');
const settings = fs.readFileSync(path.join(repo, 'migrations/018_bilingual_settings.sql'), 'utf8');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Where each dictionary group actually appears, so a reviewer has context.
const WHERE = {
  common:      ['Shared labels', 'Buttons, menu labels, and screen reader text used on every page.'],
  brand:       ['Product name', 'The wordmark itself. Appears in the header, every page title, and the footer.'],
  nav:         ['Main menu', 'The four items behind the menu button, and inline on wide screens.'],
  footer:      ['Footer', 'Three link columns and the tagline, on every page.'],
  theme:       ['Theme picker', 'The palette button in the header.'],
  language:    ['Language picker', 'The globe button in the header. This is the panel a Chinese reader finds first.'],
  notice:      ['Build notice', 'The slim bar at the very top of every page.'],
  feature:     ['Unavailable features', 'Shown on a control for something not built yet. The wording of the first one is fixed by the brief and cannot change; only its translation is under review.'],
  placeholder: ['Not-built pages', 'The page shown for a route that belongs to a later phase.'],
  status:      ['Build status page', 'The public page listing every phase.'],
  home:        ['Home page', 'The landing page. The most read Chinese on the site.'],
  notFound:    ['404 page', 'Shown for an address that does not exist.'],
  report:      ['Translation reports', 'The form an applicant uses to tell us a translation reads wrongly. Ships with the job board.'],
  commitment:  ['Commitment types', 'The five values a role can have. Also used as search filter labels.'],
  job:         ['Untranslated notice', 'Shown on a posting that has no Chinese version yet.'],
};

const ORDER = ['brand', 'language', 'home', 'nav', 'footer', 'common', 'commitment', 'job',
               'notice', 'feature', 'placeholder', 'status', 'notFound', 'report', 'theme'];

const keys = Object.keys(en).filter((k) => k !== '_comment');
const groups = {};
for (const k of keys) {
  const g = k.split('.')[0];
  (groups[g] = groups[g] || []).push({ key: k, en: en[k], zh: zh[k] });
}

// Seed reference data out of the migration. Departments first, then tags.
const rows = [...sql.matchAll(/\('([a-z-]+)',\s*'([^']+)',\s*'([^']+)'\)/g)].map((m) => ({
  slug: m[1], zh: m[2], desc: m[3],
}));
const DEPT_SLUGS = ['production', 'post-production', 'broadcast-engineering', 'creative-and-design',
                    'programming', 'community', 'events', 'operations'];
const depts = rows.filter((r) => DEPT_SLUGS.includes(r.slug));
const tags = rows.filter((r) => !DEPT_SLUGS.includes(r.slug));

// English source for the seeded rows lives in 013.
const sql013 = fs.readFileSync(path.join(repo, 'migrations/013_seed_reference_data.sql'), 'utf8');
const enRows = {};
for (const m of sql013.matchAll(/\('([^']+)',\s*\n?\s*'([a-z-]+)',\s*\n?\s*'([^']+)'/g)) {
  enRows[m[2]] = { name: m[1], desc: m[3] };
}
for (const m of sql013.matchAll(/\('([^']+)',\s+'([a-z-]+)',\s+'([^']+)'\)/g)) {
  if (!enRows[m[2]]) enRows[m[2]] = { name: m[1], desc: m[3] };
}

const heroZh = [...settings.matchAll(/'zh',\s*'([^']+)'\)/g)].map((m) => m[1]);
const heroZh2 = [...settings.matchAll(/'zh',\s*\n?\s*'([^']+)'\)/g)].map((m) => m[1]);
const hero = [
  { key: 'portal_title', en: 'Careers@GFTV', zh: heroZh[0] || heroZh2[0] },
  { key: 'hero_heading', en: 'Volunteer with Global Furry Television', zh: heroZh[1] || heroZh2[1] },
  { key: 'hero_body', en: "Find a role, apply in a few minutes, and help make the fandom's television station.", zh: heroZh2[heroZh2.length - 1] },
];

let n = 0;
const row = (prefix, id, label, sub, enText, zhText) => {
  n++;
  return `<tr id="${prefix}${id}">
      <td class="ref"><span class="chip">${prefix}${id}</span></td>
      <td class="src"><code>${esc(label)}</code>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</td>
      <td class="en" lang="en">${esc(enText)}</td>
      <td class="zh" lang="zh-Hans-SG">${esc(zhText)}</td>
    </tr>`;
};

const table = (head, body) => `<div class="tablewrap"><table>
    <thead><tr><th class="ref">Ref</th><th class="src">${head}</th><th class="en">English</th><th class="zh">华文</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;

let sections = '';

// --- The two expensive groups first ----------------------------------------
sections += `<section id="reference" class="pinned">
  <div class="secthead">
    <div>
      <p class="eyebrow">Review these first</p>
      <h2>Departments and tags</h2>
    </div>
    <span class="cost">Expensive to change later</span>
  </div>
  <p class="lede">These 26 names are stored in the database and every job posting points at them. Renaming one after postings exist means editing each posting that uses it, so a correction here is worth far more now than in a month. The web address of a tag never changes, only the name a reader sees.</p>
  <h3>Departments <span class="count">8</span></h3>
  ${table('Identifier', depts.map((d, i) =>
    row('D', i + 1, d.slug, null, (enRows[d.slug] || {}).name || d.slug, d.zh)).join(''))}
  <h3>Department descriptions <span class="count">8</span></h3>
  ${table('Identifier', depts.map((d, i) =>
    row('DD', i + 1, d.slug, null, (enRows[d.slug] || {}).desc || '', d.desc)).join(''))}
  <h3>Tags <span class="count">18</span></h3>
  ${table('Identifier', tags.map((t, i) =>
    row('T', i + 1, t.slug, null, (enRows[t.slug] || {}).name || t.slug, t.zh)).join(''))}
  <h3>Tag descriptions <span class="count">18</span></h3>
  ${table('Identifier', tags.map((t, i) =>
    row('TD', i + 1, t.slug, null, (enRows[t.slug] || {}).desc || '', t.desc)).join(''))}
</section>`;

sections += `<section id="hero">
  <div class="secthead"><div><p class="eyebrow">Editable later without cost</p><h2>Home page hero</h2></div></div>
  <p class="lede">Stored as a setting, so an admin can change this from the dashboard once that ships. Still worth getting right, since it is the first Chinese most readers see.</p>
  ${table('Setting', hero.map((h, i) => row('H', i + 1, h.key, null, h.en, h.zh)).join(''))}
</section>`;

// --- Interface strings ------------------------------------------------------
let ifaceRows = 0;
let iface = '';
for (const g of ORDER) {
  if (!groups[g]) continue;
  const [title, desc] = WHERE[g] || [g, ''];
  const body = groups[g].map((r, i) => {
    ifaceRows++;
    return row('S', ifaceRows, r.key, null, r.en, r.zh);
  }).join('');
  iface += `<h3>${esc(title)} <span class="count">${groups[g].length}</span></h3>
    <p class="note">${esc(desc)}</p>${table('Key', body)}`;
}

sections += `<section id="interface">
  <div class="secthead"><div><p class="eyebrow">Editable any time</p><h2>Interface text</h2></div></div>
  <p class="lede">Every label, button, heading, and message on the site. Changing one of these is a code edit and a deploy, so corrections are cheap but not instant. Text in braces, like <code>{phase}</code>, is filled in by the site and must stay exactly as written, though it can move within the sentence.</p>
  ${iface}
</section>`;

const total = keys.length + depts.length * 2 + tags.length * 2 + hero.length;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Careers@GFTV 华文校对</title>
<style>
:root{
  --bg:#ffffff; --raised:#f5f5f5; --sunken:#fafafa;
  --text:#1a1a2e; --muted:#4a5568; --faint:#6b7280;
  --line:rgba(180,190,200,.45); --line-strong:rgba(140,155,170,.6);
  --accent:#4a6a8a; --accent-text:#1a3a5a; --accent-wash:rgba(74,106,138,.08);
  --cost:#8a5200; --cost-wash:rgba(138,82,0,.10);
  --radius:10px; --radius-sm:6px;
  --sans:system-ui,-apple-system,'Segoe UI',sans-serif;
  --mono:ui-monospace,'SFMono-Regular',Consolas,monospace;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --bg:#0f1317; --raised:#161b21; --sunken:#131820;
    --text:#eceff3; --muted:#a7b2be; --faint:#7d8794;
    --line:rgba(160,180,200,.20); --line-strong:rgba(160,180,200,.34);
    --accent:#8fb0cf; --accent-text:#cfe0f0; --accent-wash:rgba(143,176,207,.12);
    --cost:#fbbf24; --cost-wash:rgba(251,191,36,.13);
  }
}
:root[data-theme="dark"]{
  --bg:#0f1317; --raised:#161b21; --sunken:#131820;
  --text:#eceff3; --muted:#a7b2be; --faint:#7d8794;
  --line:rgba(160,180,200,.20); --line-strong:rgba(160,180,200,.34);
  --accent:#8fb0cf; --accent-text:#cfe0f0; --accent-wash:rgba(143,176,207,.12);
  --cost:#fbbf24; --cost-wash:rgba(251,191,36,.13);
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--bg); color:var(--text);
  font-family:var(--sans); font-size:16px; line-height:1.6;
  -webkit-text-size-adjust:100%;
}
.wrap{max-width:76rem;margin:0 auto;padding:2.5rem 1.25rem 5rem;display:flex;flex-direction:column;gap:3rem}
header.top{display:flex;flex-direction:column;gap:1rem;padding-bottom:2rem;border-bottom:2px solid var(--line-strong)}
h1{font-size:clamp(1.75rem,4vw,2.5rem);line-height:1.15;margin:0;font-weight:600;letter-spacing:-.02em;text-wrap:balance}
h1 .zhtitle{font-weight:500}
.standfirst{margin:0;max-width:60ch;color:var(--muted);font-size:1.0625rem}
.stats{display:flex;flex-wrap:wrap;gap:.5rem 2rem;margin-top:.5rem}
.stat{display:flex;flex-direction:column}
.stat b{font-family:var(--mono);font-size:1.375rem;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.2}
.stat span{font-size:.75rem;text-transform:uppercase;letter-spacing:.07em;color:var(--faint)}
.brief{background:var(--raised);border:1px solid var(--line);border-radius:var(--radius);padding:1.25rem 1.5rem;display:flex;flex-direction:column;gap:.75rem}
.brief h2{margin:0;font-size:1rem;font-weight:600}
.brief ol{margin:0;padding-left:1.25rem;display:flex;flex-direction:column;gap:.5rem;color:var(--muted)}
.brief li strong{color:var(--text);font-weight:500}
.brief p{margin:0;color:var(--muted);font-size:.9375rem}
section{display:flex;flex-direction:column;gap:1rem;scroll-margin-top:1rem}
.secthead{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:1rem}
.eyebrow{margin:0 0 .25rem;font-size:.75rem;text-transform:uppercase;letter-spacing:.09em;color:var(--faint);font-weight:500}
h2{margin:0;font-size:1.5rem;font-weight:600;letter-spacing:-.01em}
h3{margin:1.5rem 0 0;font-size:1.0625rem;font-weight:600;display:flex;align-items:baseline;gap:.5rem}
.count{font-family:var(--mono);font-size:.8125rem;font-weight:400;color:var(--faint);font-variant-numeric:tabular-nums}
.lede{margin:0;max-width:68ch;color:var(--muted)}
.note{margin:.25rem 0 0;max-width:68ch;color:var(--faint);font-size:.875rem}
.cost{align-self:center;background:var(--cost-wash);color:var(--cost);border:1px solid currentColor;border-radius:999px;padding:.2rem .7rem;font-size:.75rem;font-weight:500;white-space:nowrap}
.pinned{border-left:3px solid var(--cost);padding-left:1.25rem;margin-left:-1.25rem}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);background:var(--sunken)}
table{width:100%;border-collapse:collapse;font-size:.9375rem}
thead th{text-align:left;font-size:.6875rem;text-transform:uppercase;letter-spacing:.08em;color:var(--faint);font-weight:600;padding:.6rem .85rem;border-bottom:1px solid var(--line);background:var(--raised);position:sticky;top:0}
td{padding:.7rem .85rem;border-bottom:1px solid var(--line);vertical-align:top}
tbody tr:last-child td{border-bottom:0}
tbody tr:target{background:var(--accent-wash)}
td.ref{width:1%;white-space:nowrap}
.chip{font-family:var(--mono);font-size:.75rem;color:var(--accent-text);background:var(--accent-wash);border-radius:var(--radius-sm);padding:.15rem .45rem;font-variant-numeric:tabular-nums}
td.src{width:16%;min-width:9rem}
td.src code{font-family:var(--mono);font-size:.75rem;color:var(--muted);word-break:break-all}
td.en{width:38%;color:var(--muted)}
td.zh{width:38%;font-size:1.0625rem;line-height:1.8}
footer{border-top:1px solid var(--line);padding-top:1.5rem;color:var(--faint);font-size:.875rem;display:flex;flex-direction:column;gap:.5rem}
code{font-family:var(--mono);font-size:.875em}
@media (max-width:900px){
  td.src{display:none} thead th.src{display:none}
  td.en,td.zh{width:auto;display:block;border-bottom:0;padding-bottom:0}
  td.zh{padding-top:.35rem;padding-bottom:.7rem;border-bottom:1px solid var(--line)}
  td.ref{display:block;border-bottom:0;padding-bottom:.25rem}
  thead{display:none}
  tbody tr{display:block;border-bottom:1px solid var(--line)}
  tbody tr:last-child{border-bottom:0}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>

<div class="wrap">
  <header class="top">
    <h1>Careers@GFTV <span class="zhtitle">华文校对</span></h1>
    <p class="standfirst">Every word of Chinese on the careers portal, beside its English source. None of it has been read by a fluent speaker yet, and the site goes public when the job board ships.</p>
    <div class="stats">
      <div class="stat"><b>${total}</b><span>Entries</span></div>
      <div class="stat"><b>${keys.length}</b><span>Interface</span></div>
      <div class="stat"><b>${depts.length * 2 + tags.length * 2}</b><span>Departments and tags</span></div>
      <div class="stat"><b>1</b><span>Reviewer needed</span></div>
    </div>
  </header>

  <div class="brief">
    <h2>How to review this</h2>
    <ol>
      <li><strong>Start with departments and tags.</strong> They are marked below. Everything else can be corrected cheaply later; those cannot.</li>
      <li><strong>Read the Chinese first, English second.</strong> The question is whether the Chinese reads naturally to a Singaporean reader, not whether it matches the English word for word.</li>
      <li><strong>Send corrections as a list of reference codes.</strong> Each row has one, like <code>T4</code> or <code>S31</code>. Write the code and your replacement wording. No need to explain unless the reason is not obvious.</li>
    </ol>
    <p>The Chinese should be Singapore Mandarin, not Mainland usage: 义工 not 志愿者, 华文 not 中文, 电邮 not 电子邮件, 营运 not 运营, 合约 not 合同. Flag anything that reads as Mainland or Taiwanese. The Chinese below renders in your own device's font, which is exactly what a reader will see.</p>
  </div>

  ${sections}

  <footer>
    <p>Generated from the repository on ${new Date().toISOString().slice(0, 10)}. Interface text comes from <code>assets/i18n/zh.json</code>; departments and tags from migration <code>014</code>; hero copy from migration <code>018</code>.</p>
    <p>The product name is written 国际兽视 Careers, and GFTV alone is 国际兽视. A space sits between Latin and Han characters, never between Han and Han.</p>
  </footer>
</div>
</body>
</html>`;

fs.writeFileSync(out, html);
console.log('written: ' + out);
console.log('total entries: ' + total + '  (interface ' + keys.length + ', depts ' + depts.length + ', tags ' + tags.length + ', hero ' + hero.length + ')');
console.log('hero zh: ' + JSON.stringify(hero.map(h => h.zh)));
console.log('sample dept: ' + JSON.stringify(depts[0]) + ' en=' + JSON.stringify(enRows[depts[0].slug]));
console.log('sample tag : ' + JSON.stringify(tags[0]) + ' en=' + JSON.stringify(enRows[tags[0].slug]));
