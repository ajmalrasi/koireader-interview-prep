# DEPLOY

Deploys **both** the study website and the live Jupyter playground on the Raspberry
Pi as boot services. Idempotent — re-run any time to ship updates. Ignore the other
`.md` files for deployment; they're study notes.

**Two ways to run this:**
- **On the Pi** — paste this file into Claude Code running on the Pi, or
- **Remotely from another machine** — drive it over SSH (`ssh rpi`, host
  `192.168.3.20`, user `ajmalrasi`). Run every command below through that SSH.

## Target

| | |
|---|---|
| Repo | `https://github.com/ajmalrasi/koireader-interview-prep` (**public** — pull over HTTPS) |
| Directory | `/home/ajmalrasi/koireader-interview-prep` |
| `koi-prep` | static website, port **9000** (no build needed to serve) |
| `koi-jupyter` | JupyterLab, port **8888**, fixed token **`koireader`** (needs a Python venv) |

## Gotchas (learned the hard way — read before you start)

- **Pi pulls over HTTPS, not SSH.** The Pi has no GitHub key. If `origin` is
  `git@github.com:...` you'll get `Host key verification failed`. Fix once:
  `git remote set-url origin https://github.com/ajmalrasi/koireader-interview-prep.git`
- **The Pi's checkout may be dirty/divergent** (a stale local commit + old untracked
  source files) and `git pull --ff-only` will abort. Back up, then force-sync:
  `git reset --hard origin/main && git clean -fd` (respects `.gitignore`, so `.venv`
  survives).
- **`apt` is usually unnecessary** — `python3 -m venv` already works on Raspberry Pi
  OS. Only `sudo apt-get install -y python3-venv` if `python3 -c "import venv"` fails.
- **Jupyter takes ONE root-dir flag.** `--notebook-dir` is an alias for
  `ServerApp.root_dir`; passing both makes jupyter-server reject `root_dir` ("got 2
  values") and crash-loop. Use only `--ServerApp.root_dir`.
- **`systemctl is-active` lies under `Restart=always`** — it reports `active` while a
  process crash-loops. Always confirm the port actually binds
  (`ss -ltn | grep :8888`) and `NRestarts` is stable.
- **Don't run `run.sh` from the Jupyter unit** — it starts its own server on 9000 and
  clashes with `koi-prep`. Launch `jupyter lab` directly.

## Steps

**1. Code** — clone if missing, else sync to the pushed code:
```bash
cd /home/ajmalrasi/koireader-interview-prep
git remote set-url origin https://github.com/ajmalrasi/koireader-interview-prep.git
git fetch origin && git reset --hard origin/main && git clean -fd
git log -1 --oneline
```

**2. Venv + deps + notebooks:**
```bash
cd /home/ajmalrasi/koireader-interview-prep
python3 -c "import venv" || sudo apt-get update && sudo apt-get install -y python3-venv
[ -d .venv ] || python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python build_notebooks.py     # (re)generate notebooks from the .md
```

**3. Write `/etc/systemd/system/koi-prep.service`** (show it first):
```ini
[Unit]
Description=KoiReader study website
After=network.target

[Service]
WorkingDirectory=/home/ajmalrasi/koireader-interview-prep
ExecStart=/usr/bin/python3 -m http.server 9000
Restart=always
User=ajmalrasi

[Install]
WantedBy=multi-user.target
```

**4. Write `/etc/systemd/system/koi-jupyter.service`** (show it first; note the single
root-dir flag — see Gotchas):
```ini
[Unit]
Description=KoiReader live Jupyter notebooks
After=network.target

[Service]
WorkingDirectory=/home/ajmalrasi/koireader-interview-prep
ExecStart=/home/ajmalrasi/koireader-interview-prep/.venv/bin/jupyter lab \
  --no-browser --ip=0.0.0.0 --port=8888 \
  --IdentityProvider.token=koireader \
  --ServerApp.root_dir=/home/ajmalrasi/koireader-interview-prep/notebooks
Restart=always
User=ajmalrasi

[Install]
WantedBy=multi-user.target
```

**5. Enable + (re)start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now koi-prep koi-jupyter
sudo systemctl restart koi-prep koi-jupyter   # pick up new code on a re-run
```

**6. Verify (don't trust `is-active` alone):**
```bash
systemctl is-active koi-prep koi-jupyter                       # both: active
ss -ltn | grep -E ':9000|:8888'                                # both ports bound
curl -fsS http://localhost:9000/ | head -c 200                 # HTML
curl -s -o /dev/null -w '%{http_code}\n' \
  "http://localhost:8888/lab?token=koireader"                  # 200, not 403
hostname -I                                                    # LAN IP
```
Then print the two URLs: `http://<ip>:9000` and
`http://<ip>:8888/lab?token=koireader`. The website's **"Open live notebooks"** button
(top-left) and the *Coding Practice* link open Jupyter automatically.

## Constraints

- **LAN only** — never expose these ports to the public internet. The `koireader`
  token is fine on a home network. To change it: update `_app.js` (`JUPYTER_TOKEN`),
  rebuild the site with `node build.js`, and update the `koi-jupyter` unit's token.
- `sudo` only for `apt` and for writing/enabling the two unit files.

## Update later (one shot)
```bash
cd /home/ajmalrasi/koireader-interview-prep \
  && git fetch origin && git reset --hard origin/main && git clean -fd \
  && ./.venv/bin/python build_notebooks.py \
  && sudo systemctl restart koi-prep koi-jupyter
```

---

**Human cheat-sheet** — local try-out without systemd: `bash run.sh` serves the site
on :9000 and Jupyter on :8888 (token `koireader`). After deploy, open
`http://<pi-ip>:9000` → **Open live notebooks** → `http://<pi-ip>:8888/lab?token=koireader`.
