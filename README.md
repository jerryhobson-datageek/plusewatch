# PulseWatch — Status Dashboard

A self-hosted uptime monitoring dashboard. Monitors HTTP and TCP services and displays live status, response times, and incident history.

---

## Files

| File | Description |
|---|---|
| `index.html` | The dashboard frontend |
| `server.js` | Node.js backend — runs health checks and serves the dashboard |
| `config.json` | Your services configuration |
| `setup.sh` | One-command installer for Linux |

---

## Deployment

### Requirements
- A Linux server (Ubuntu/Debian or RHEL/Rocky/CentOS)
- SSH access with a user that can `sudo`

---

### Step 1 — Edit config.json

Before uploading, open `config.json` and set your services. Example:

```json
{
  "port": 3000,
  "interval": 30,
  "services": [
    {
      "id": 1,
      "name": "My Site",
      "url": "https://mysite.com",
      "type": "HTTP",
      "degradedThreshold": 1000
    },
    {
      "id": 2,
      "name": "Postgres",
      "url": "localhost:5432",
      "type": "TCP"
    }
  ]
}
```

---

### Step 2 — Copy files to the server

From PowerShell on Windows:

```powershell
scp C:\claudcode\index.html C:\claudcode\server.js C:\claudcode\config.json C:\claudcode\setup.sh user@YOUR_SERVER_IP:~/pulsewatch/
```

Replace `user` and `YOUR_SERVER_IP` with your SSH username and server IP.

---

### Step 3 — SSH into the server

```bash
ssh user@YOUR_SERVER_IP
```

---

### Step 4 — Run the installer

```bash
cd ~/pulsewatch
chmod +x setup.sh
sudo ./setup.sh
```

The installer will:
- Install Node.js 20 (if not already installed)
- Install nginx (if not already installed)
- Deploy files to `/opt/pulsewatch/`
- Register and start a `systemd` service
- Configure nginx as a reverse proxy on port 80

When complete you will see:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PulseWatch is running!

  Dashboard  →  http://YOUR_SERVER_IP
  Direct     →  http://YOUR_SERVER_IP:3000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Step 5 — Open the dashboard

Go to `http://YOUR_SERVER_IP` in your browser. Cards will show real status within 30 seconds as the first checks complete.

---

### Step 6 — Point a subdomain at it (optional)

If you use Nginx Proxy Manager, add a new Proxy Host:

| Field | Value |
|---|---|
| Domain Name | `status.yourdomain.com` |
| Scheme | `http` |
| Forward Hostname/IP | Your server's local IP |
| Forward Port | `3000` |
| SSL | Request a new Let's Encrypt cert |

---

## Managing Services

Services are configured in `/opt/pulsewatch/config.json` on the server.

### Add a new service

```bash
nano /opt/pulsewatch/config.json
```

Add a new entry to the `services` array:

```json
{
  "id": 4,
  "name": "My New Site",
  "url": "https://newsite.com",
  "type": "HTTP",
  "degradedThreshold": 1000
}
```

Then restart to apply:

```bash
systemctl restart pulsewatch
```

### Service config options

| Field | Required | Description |
|---|---|---|
| `id` | Yes | Unique number — just keep incrementing |
| `name` | Yes | Display name shown on the card |
| `url` | Yes | Full URL for HTTP, or `host:port` for TCP |
| `type` | Yes | `HTTP` or `TCP` |
| `interval` | No | Check interval in seconds (default: 30) |
| `degradedThreshold` | No | Response time in ms above which status turns yellow |
| `timeout` | No | Request timeout in ms (default: 5000) |

---

## Service Management

| Action | Command |
|---|---|
| Start | `systemctl start pulsewatch` |
| Stop | `systemctl stop pulsewatch` |
| Restart | `systemctl restart pulsewatch` |
| Check status | `systemctl status pulsewatch` |
| View live logs | `journalctl -u pulsewatch -f` |

---

## Updating

To deploy updated files from your Windows machine:

```powershell
scp C:\claudcode\index.html C:\claudcode\server.js C:\claudcode\setup.sh user@YOUR_SERVER_IP:~/pulsewatch/
```

Then SSH in and re-run the installer — it is safe to run multiple times and will not overwrite your `config.json`:

```bash
cd ~/pulsewatch
sudo ./setup.sh
```
