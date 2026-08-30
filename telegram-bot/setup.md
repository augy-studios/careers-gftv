# setup.md

Everything BotFather needs to know about `careersgftv_bot`, and the two
credentials that do not come from BotFather at all.

Work through it once per bot. If you are setting up a second bot for testing,
everything here applies except that the username will be different, which means
the deep links in account settings point at the live one and not at yours.

---

## 1. Before BotFather: the Telethon credentials

**These do not come from BotFather.** Telethon speaks MTProto rather than the
HTTP Bot API, so it needs an application id and hash belonging to a Telegram
*account*, in addition to the bot token.

1. Sign in at [my.telegram.org](https://my.telegram.org) with the phone number
   of the account that will own the application.
2. Open **API development tools**.
3. Fill in the form once. App title and short name can be anything; the platform
   is Other and the URL can be left empty.
4. Keep **`App api_id`** and **`App api_hash`**.

They go in `.env` as `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`. They are tied to
the account, not to the bot, so the same pair is reused if a second bot is ever
made, and they never need to be regenerated because a token was rotated.

---

## 2. Creating the bot

In Telegram, message [@BotFather](https://t.me/BotFather).

```text
/newbot
```

It asks two questions in order.

| It asks | Answer | Notes |
|---|---|---|
| Name | `Careers@GFTV` | The display name at the top of the chat. Up to 64 characters, changeable later with `/setname`. |
| Username | `careersgftv_bot` | Fixed by specification section 15. Must end in `bot` and cannot be changed afterwards. |

BotFather replies with the **token**, which looks like
`123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. That is
`TELEGRAM_BOT_TOKEN` in `.env`.

**The token is a password.** Anyone holding it can read every message sent to
the bot and send as it. If it is ever pasted somewhere it should not be, use
`/revoke` immediately, which issues a new one and kills the old.

---

## 3. The profile text

Two different fields that are easy to mix up.

**About**, up to 120 characters, shown on the bot's profile card and when
somebody forwards it to a friend:

```text
The Telegram side of Careers@GFTV. Link your account for invitations, notifications, and one tap sign in.
```

Set it with `/setabouttext`, or `/mybots` then **Edit Bot** then **Edit About**.

**Description**, up to 512 characters, shown in an empty chat above the Start
button, so it is the first thing a new person reads:

```text
Careers@GFTV is the volunteer job portal for GFTV. Link your portal account here and you can sign in with one tap, get invitations to roles, and hear when one of your applications moves. Everything sent here is in the portal too, so nothing ever arrives only in this chat. Press Start for the full list of what you can ask for.
```

Set it with `/setdescription`, or **Edit Bot** then **Edit Description**.

**No documentation link in either, yet.** The applicant's guide is phase 14's,
on a site that has nothing on it until phase 13, and section 16's rule is that
the link must not ship before the page does. The same rule keeps it out of the
start message.

**Profile picture** is `/setuserpic`, or **Edit Bot** then **Edit Botpic**.
Square, and note that section 8 item 3 of the working memo says the current icon
artwork is still the template's, so this is worth doing once and redoing when
there is a real one.

### The Chinese versions

BotFather's menus set one About and one Description, and they are what everybody
sees regardless of their Telegram language. Per-language versions exist in the
Bot API, through `setMyDescription` and `setMyShortDescription` with a
`language_code`, and **nothing in this build calls either today**. The text is
here so that whatever does it later is not writing it from scratch:

```text
关联您的求职账户，即可接收职位邀请和通知，并一键登录。
```

```text
国际兽视 Careers 是国际兽视的义工招募网站。在这里关联您的求职账户后，您可以一键登录、收到职位邀请，并在您的申请有进展时收到通知。这里发送的所有内容，在网站上同样可以查看，不会只出现在这个聊天里。点击开始，查看您可以使用的全部功能。
```

The command list is a different matter and is already localised. See below.

---

## 4. The command list

**Do not type this list by hand.** It is generated from `commands.py`, which is
the only copy of it in the build: the bot registers Telegram's menu from that
file at every startup, `start` prints from it, and phase 14's applicant guide
takes its command reference from it. Regenerate the block any time with:

```bash
python commands.py
```

Send `/setcommands` to BotFather, choose the bot, then paste **the English block
exactly as printed**, with no leading slashes and nothing else in the message:

```text
start - What this can do, and the full list.
link - Link this Telegram account to your portal account.
unlink - Remove the link, after a confirmation.
code - Send a fresh one time sign in code.
invites - Your open invitations, with a link to each role.
tasks - What is waiting for you, and where to answer it.
applications - Your applications, and where each one stands.
jobs - The newest openings, with a link to each posting.
notify - Choose which notifications you receive here.
```

If that block and `python commands.py` ever disagree, the file is right and this
document is stale. Fix the document. **`python commands.py --check` says so
without anybody comparing lines by eye**, and it reads the table in `README.md`
in the same pass.

### This step is optional, and worth doing anyway

**The bot sets its own commands on every startup**, in every language the build
ships in, which is something BotFather cannot do: `/setcommands` sets one list
for everybody, and a reader whose Telegram is in 华文 gets this instead, with no
extra step:

```text
start - 介绍本服务的功能，并列出全部指令。
link - 将此 Telegram 账户与您的求职账户关联。
unlink - 解除关联，操作前会先请您确认。
code - 发送一个新的一次性登录验证码。
invites - 查看您收到的职位邀请，并附上各职位的链接。
tasks - 查看有哪些事项待您处理，以及在哪里回复。
applications - 查看您的申请，以及每份申请的当前状态。
jobs - 查看最新发布的职位，并附上各职位的链接。
notify - 选择您希望在这里收到哪些通知。
```

So pasting the English block into BotFather buys one thing: the menu is right
before the bot has ever been started, and it stays right if the process is down.
The bot overwrites it with the same content the moment it next runs.

**Every command is listed, and since phase 11 part 6 every one of them answers.**
The rule that put unbuilt commands in the menu anyway outlives them: a command
missing from the menu and then answering when typed is worse than one that is
listed and honest about where it has got to, so a tenth command is listed the
day it is written rather than the day it works.

---

## 5. Settings that matter

From `/mybots`, choose the bot, then **Bot Settings**.

| Setting | Set it to | Why |
|---|---|---|
| Group Privacy | **Enabled**, which is the default | The bot answers private chats only. Privacy mode means it cannot read ordinary group messages even if somebody adds it to one. |
| Allow Groups? | **Disabled** | It has nothing to do in a group, and the dispatcher ignores every non-private chat. Turning this off stops the confusion at the door rather than in the code. |
| Inline Mode | **Disabled**, the default | Nothing in section 15 is inline. |
| Payments | Leave alone | Never used. Every role in this build is unpaid, per section 7. |
| Domain | Leave empty | That is for Telegram's Login Widget. This build signs people in with its own magic link, bound to the browser that asked for it, and does not use the widget. |
| Menu Button | Leave as the default commands menu | A web app button would open the portal inside Telegram's browser, where a passkey does not work. |

**Deep links need no configuration at all.**
`https://t.me/careersgftv_bot?start=<token>` works the moment the bot exists,
and the payload arrives as `/start <token>`. That is what the QR code in account
settings encodes, from part 2 onwards.

---

## 6. Filling in `.env`

Copy the example and fill in six values. Every one is documented in place.

```bash
cd telegram-bot
cp .env.example .env
```

| Variable | Where it came from |
|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather, section 2 above. `/mybots` then **API Token** if you need it again. |
| `TELEGRAM_API_ID` | my.telegram.org, section 1. |
| `TELEGRAM_API_HASH` | my.telegram.org, section 1. |
| `SUPABASE_URL` | Supabase dashboard, Project Settings, Data API. The same project the site uses. |
| `SUPABASE_SERVICE_KEY` | Supabase dashboard, API Keys, the `service_role` key. It bypasses row level security, so treat it like a database password. |
| `SITE_URL` | `https://careers.globalfurry.tv`, no trailing slash. |
| `DONATION_URL` | Optional. Left empty, the button is simply not drawn. |
| `LOG_LEVEL` | Optional, defaults to `INFO`. |

**All six required ones are checked at startup**, and a missing one is reported
with every other missing one rather than one restart at a time.

---

## 7. Checking it worked

```bash
python bot.py
```

The log should show, in this order: the SQLite migration on a first run, the pid
and start number, which build status was read and what it says, `connected as
@careersgftv_bot`, the command list with what answers today, and `ready`.

Then, in Telegram:

- `/start` replies with the introduction, all nine commands, and a button
  through to the portal.
- A command whose feature an admin has switched off replies with the maintenance
  sentence rather than with silence or with a claim that it was never built.
- Typing something that is not a command at all gets a single line pointing at
  `/start`.
- The menu button beside the message box lists all nine commands.

**Starting it a second time while it is running is refused**, with the process
id of the one holding the lock and exit status 3. That is deliberate: an old
instance left polling after a bad restart is the failure this component is most
exposed to.

That is enough to know the process is up and talking to Telegram. **Proving the
build is a different job**, and it is the by-hand checklist in
[`README.md`](README.md#the-by-hand-checklist), which is the only coverage the
Python has.

---

## 8. BotFather commands, for reference

The ones that are relevant here, and the ones worth knowing not to use.

| Command | What it does |
|---|---|
| `/newbot` | Creates the bot. Asks for the name, then the username. |
| `/mybots` | The menu behind everything else: API Token, Edit Bot, Bot Settings, Delete Bot. |
| `/token` | Shows the current token again. |
| `/revoke` | Issues a new token and kills the old one. Use the moment a token leaks. |
| `/setname` | Changes the display name. The username can never be changed. |
| `/setabouttext` | The 120 character profile line. |
| `/setdescription` | The 512 character text above the Start button in an empty chat. |
| `/setuserpic` | The profile picture. |
| `/setcommands` | The command list. One `name - description` per line, no slashes. |
| `/deletecommands` | Clears the list. The bot will set it again on its next startup. |
| `/setjoingroups` | Whether the bot can be added to groups. Disable it. |
| `/setprivacy` | Group privacy mode. Leave enabled. |
| `/setinline` | Inline mode. Not used. |
| `/setdomain` | For Telegram's Login Widget. Not used, and setting it would suggest a sign in route this build does not offer. |
| `/deletebot` | Deletes the bot. The username is not immediately reusable. |

### The limits BotFather enforces

| Field | Limit |
|---|---|
| Name | 64 characters |
| About | 120 characters |
| Description | 512 characters |
| Command name | 1 to 32 characters, lowercase letters, digits and underscores only |
| Command description | 3 to 256 characters |
| Commands per list | 100 |
