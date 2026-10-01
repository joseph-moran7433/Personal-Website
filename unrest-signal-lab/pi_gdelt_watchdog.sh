#!/bin/bash
# Runs every minute via cron (NOT a long-lived nohup'd process) specifically
# because cron-spawned processes are managed by the system crond, not by any
# SSH login session -- the previous nohup+disown approach got silently
# killed in full (bash loop and all) when the launching SSH session's
# systemd scope was torn down (Linger=no on this account), losing ~24h.
# A 1-minute poll cadence means at most 1 minute of idle time if the main
# process ever dies; the main process itself handles many days per
# invocation (--days 99999), so this is a safety net, not the driver.
cd /home/math-pi-6/Personal-Website/unrest-signal-lab
if ! pgrep -f 'python.*pi_gdelt_raw_pull.py' > /dev/null; then
  source .venv/bin/activate
  nohup python -u pi_gdelt_raw_pull.py --days 99999 --push --workers 16 >> .cache/pi_raw_pull.log 2>&1 &
  disown
  echo "[watchdog] $(date -u +%Y-%m-%dT%H:%M:%SZ) relaunched pi_gdelt_raw_pull.py"
fi
