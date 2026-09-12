#!/usr/bin/env sh
# Start the status probe from anywhere, in this directory's own virtualenv.
# setup.md says how the venv and the .env get here; this only runs what is
# there, and says so if it is not.
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "no virtualenv at $(pwd)/.venv. See setup.md, step 2." >&2
  exit 2
fi
if [ ! -f .env ]; then
  echo "no .env at $(pwd)/.env. Copy .env.example and fill in the three values. See setup.md, step 3." >&2
  exit 2
fi
exec .venv/bin/python probe.py
