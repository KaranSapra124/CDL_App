# VPS setup notes (Ubuntu 22.04 / 24.04)

What runs on the server: the Go API (with the video transcoder inside it), PostgreSQL, Nginx,
ffmpeg/ffprobe, and the Next.js admin app. Videos live on disk under `/srv/cdl/media`.

## 1. Packages

```bash
sudo apt update
sudo apt install -y postgresql nginx ffmpeg
ffmpeg -version | head -1     # must be installed before videos can finish processing
ffprobe -version | head -1
```

## 2. Media folder

```bash
sudo mkdir -p /srv/cdl/media
sudo useradd --system --home /srv/cdl --shell /usr/sbin/nologin cdl || true
sudo chown -R cdl:cdl /srv/cdl
sudo chmod 750 /srv/cdl/media
```

Plan disk space: about 700 MB per 20-minute video for the three HLS renditions, plus the
original upload until you delete it. Size the disk for the number of courses you expect.

## 3. Database

Create a database user with a strong password and the `creditdost_learning` database, then run
the migrations from `Backend/migrations` (see `migrate` in the Backend README). Listen on
`localhost` only.

## 4. API environment (`/etc/cdl/api.env`, owned by root, mode 600)

```
API_ADDR=127.0.0.1:8080
DATABASE_URL=postgres://cdl_app:STRONG_PASSWORD@localhost:5432/creditdost_learning?sslmode=disable
JWT_SECRET=<openssl rand -base64 48>
COOKIE_SECURE=true
ADMIN_INVITE_CODE=<only while creating admins; remove afterwards>
MEDIA_DIR=/srv/cdl/media
MAX_VIDEO_BYTES=4294967296
TRANSCODE_ENABLED=true
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
# Leave ADMIN_ORIGIN empty in production: the browser calls the API through the same domain.
```

## 5. API service (`/etc/systemd/system/cdl-api.service`)

```ini
[Unit]
Description=Credit Dost Learning API
After=network.target postgresql.service

[Service]
User=cdl
EnvironmentFile=/etc/cdl/api.env
ExecStart=/srv/cdl/bin/server
WorkingDirectory=/srv/cdl
Restart=on-failure
Nice=10

[Install]
WantedBy=multi-user.target
```

`Nice=10` keeps ffmpeg work from starving the database and the admin site. Build the binary on
your machine with `GOOS=linux GOARCH=amd64 go build -o server ./cmd/server` and copy it to
`/srv/cdl/bin/server`.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cdl-api
journalctl -u cdl-api -f    # look for "transcoder running"
```

## 6. Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name admin.creditdostlearning.com;
    # ssl_certificate / ssl_certificate_key from Let's Encrypt or Cloudflare

    # Large video uploads go straight to the API.
    client_max_body_size 5g;
    client_body_timeout 3600s;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_request_buffering off;   # stream uploads to the API instead of buffering on disk
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;   # Next.js admin app (pm2 or systemd)
        proxy_set_header Host $host;
    }
}
```

Keep `client_max_body_size` at least as large as `MAX_VIDEO_BYTES`. Otherwise Nginx rejects big
uploads before the API sees them.

## 7. Checks after deploying

- `curl -s https://admin.creditdostlearning.com/api/admin/auth/me` returns 401 (not 502 or 404).
- Upload a short test video in the admin, watch the module move from "waiting" to "ready",
  and preview it.
- `ls /srv/cdl/media/hls` shows a folder per module, with `master.m3u8` inside.
- Back up the database daily (`pg_dump`) and copy `/srv/cdl/media` to offsite storage. The
  PRD's Bunny.net backup no longer applies.
