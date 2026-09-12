# Setting up the status probe on the VPS

The same Debian 13 machine the Telegram bot runs on, with this repository
checked out at `~/Github/careers-gftv`. Nothing here touches the bot: the
probe has its own virtualenv, its own `.env`, its own lock and its own log,
and the two never import each other. About ten minutes.

## 1. Where it runs, and why there

Section 0c of the specification wants the status page fed by a prober
**outside Vercel**, because a status page hosted on the thing it monitors is
useless during the outage it exists to report. The VPS is the only machine in
the architecture that is not Vercel, so this is where it runs. It has nothing
to do with Telegram and needs no Telegram credential.

## 2. The virtualenv

```bash
cd ~/Github/careers-gftv/status-probe
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

One dependency, httpx. The bot's virtualenv is not reused, on purpose: a
`pip install` for the bot must never be able to break the probe, and the other
way round.

## 3. The three variables

```bash
cp .env.example .env
```

Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `SITE_URL`. They are the
same three values as in `telegram-bot/.env`, under the same names; copy them
across. `SITE_URL` is production, `https://careers.globalfurry.tv`, and never
a preview deployment.

The service key bypasses row level security. It stays in this file, on this
machine, and `.env` is gitignored.

## 4. First run, by hand

```bash
./run.sh
```

The log names, in order, the pid, the site it is watching, the Supabase
project it is writing to, and then one line a minute:

    wrote 4 checks, 0 failed, slowest 610ms

Open [careers.globalfurry.tv/status](https://careers.globalfurry.tv/status).
Within a minute of the first line, today's square in each of the four ninety
day bars is green. Yesterday's and every earlier day stay blank: nothing
measured them, and the page never draws a day it has no data for as a good
one.

If it exits with status 2 it lists every variable that is missing or wrong.
If it exits with status 3, another probe holds `probe.lock`, and the message
names its pid.

## 5. Keeping it running

Two ways. The tmux window is what the bot uses and is fine for a machine
somebody looks at; the systemd unit is the one that survives a reboot without
anybody remembering, and is the better answer for a process whose whole job
is to be there when nobody is looking.

### A tmux window

```bash
tmux new-window -n probe -c ~/Github/careers-gftv/status-probe ./run.sh
```

Detach as usual. After a reboot the session is gone, and so is the probe,
until somebody starts it again. That is what the blank days on the status page
were, from 31 August to 13 September 2026.

### A systemd unit

`/etc/systemd/system/careers-gftv-probe.service`, with your username in place
of `augy`:

```ini
[Unit]
Description=Careers@GFTV status probe
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=augy
WorkingDirectory=/home/augy/Github/careers-gftv/status-probe
ExecStart=/home/augy/Github/careers-gftv/status-probe/run.sh
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now careers-gftv-probe
systemctl status careers-gftv-probe
```

`Restart=on-failure` restarts it after exit 1 and after a crash, and does not
restart it after a clean stop or after exit 2 or 3, which are a person's
problem to read. The lock is released by the kernel when the process ends, so
a restart never waits on a stale lock file.

Stop it with `sudo systemctl stop careers-gftv-probe`. Do not run the tmux
window and the unit at the same time: the second one to start exits 3 and
says so.

## 6. Deploying a change

```bash
cd ~/Github/careers-gftv
git pull
cd status-probe
source .venv/bin/activate
pip install -r requirements.txt     # only if that file changed
```

Then restart it: `sudo systemctl restart careers-gftv-probe`, or stop and
start the tmux window. The probe reads the tree it was started from and
nothing else, so a pull without a restart changes nothing.

## 7. Reading the log

`logs/probe.log`, rotating at 2MB, five files kept. Times are UTC, to match
what the database records.

    wrote 4 checks, 0 failed, slowest 610ms      the ordinary minute
    wrote 4 checks, 1 failed, slowest 8000ms     a target did not answer as it should
    could not write 4 checks, dropping them: …   Supabase refused; the minute is drawn as unknown
    the posting page answered 404, re-picking    the seeded posting it was watching is gone

A failed check is the portal's problem and the page shows it. A dropped write
is Supabase's, and the page shows nothing for that minute, which is the
specified behaviour: a gap is honest and a backfilled row is not.
