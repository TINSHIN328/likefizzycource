# Complete setup guide for config.json (Azure Ubuntu VPS + mooissha.dev)

This guide shows how to deploy this project on an Azure Ubuntu VPS using your domain mooissha.dev, and how to correctly fill out every field in david/config.json. It assumes basic command‑line familiarity.

Important:
- Never commit real secrets (tokens, webhooks, passwords) to Git.
- Keep your production config.json on the server only.


## 1) High‑level overview

- You will run the Node.js app on your Azure Ubuntu VPS.
- The app connects to Discord via bot token(s) and uses your Discord server (guild) and channels by ID.
- Optional: it can send emails (SMTP). Azure often blocks outbound SMTP on port 25 — use a provider like SendGrid, Mailgun, or Gmail SMTP if needed.
- Your mooissha.dev domain will point (A record) to your VPS public IPv4. Nginx will serve HTTPS with a Let’s Encrypt certificate and reverse‑proxy to the Node app (if HTTP endpoints are used by this bot).


## 2) Prepare Azure Ubuntu VPS

1. Create an Azure Ubuntu VM (22.04 LTS or 24.04 LTS recommended).
2. In the Network Security Group (NSG), allow inbound ports:
   - 22 (SSH)
   - 80 (HTTP) — for initial certificate issuance and redirects
   - 443 (HTTPS)
   - If your app exposes a custom HTTP port directly, you can keep it internal only and proxy via Nginx.
3. Get the VM public IPv4 from Azure portal. You will use it for DNS A records and as vpsip in config if needed.

Security basics:
- Use SSH keys instead of passwords, disable password login, and keep packages updated.
- Create a non‑root user with sudo.


## 3) Point mooissha.dev DNS to the VPS

At your domain registrar (or DNS hosting provider), create records:
- A @ → <YOUR_VPS_IPV4>
- A www → <YOUR_VPS_IPV4> (optional if you want www)

Wait for DNS to propagate (usually 5–30 minutes, sometimes up to 24h).


## 4) Install runtime: Node.js LTS + PM2

On the VPS (SSH in):

- Update system
  sudo apt update && sudo apt -y upgrade

- Install Node.js LTS (use NodeSource for current LTS)
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt -y install nodejs build-essential

- Verify
  node -v
  npm -v

- Install PM2 (process manager)
  sudo npm i -g pm2


## 5) Install and run the project

- Copy your project to the VPS. Options:
  - git clone from your repository, or
  - upload files via SFTP/rsync.

- Move into the david directory and install dependencies:
  cd ~/davids-autosecure-main/david
  npm ci   # or: npm install

- Test a one‑off run (it will likely fail until config.json is filled):
  npm start


## 6) Create your Discord application and bot

1. Go to https://discord.com/developers/applications and create a New Application.
2. In Bot tab → Add Bot.
3. Copy the Bot Token (regenerate if needed). Treat it as a secret.
4. In Bot → Privileged Gateway Intents: enable at least "SERVER MEMBERS INTENT" and "MESSAGE CONTENT INTENT" if your bot needs to read messages. This project uses many guild features; enabling all three intents is usually necessary.
5. In OAuth2 → URL Generator: select "bot" scope and required permissions. Copy the invite URL and invite the bot to your server.
6. In Discord client, enable Developer Mode (User Settings → Advanced). You’ll use it to copy IDs (right‑click → Copy ID).

Collect these IDs from your Discord server:
- guildid (Server ID)
- welcomechannel, leaderboard, log, transcripts, ticketcategory (Channel IDs)
- roleid (role to grant access), memberrole (default member role) (Role IDs)


## 7) Nginx reverse proxy with SSL (Let’s Encrypt)

If the app exposes HTTP endpoints (many bots do), set up Nginx to proxy HTTPS from mooissha.dev to your Node app.

- Install Nginx and Certbot
  sudo apt -y install nginx
  sudo snap install core; sudo snap refresh core
  sudo snap install --classic certbot
  sudo ln -s /snap/bin/certbot /usr/bin/certbot

- Open firewall (if UFW used)
  sudo ufw allow OpenSSH
  sudo ufw allow 'Nginx Full'
  sudo ufw enable

- Create an Nginx server block (basic example). Replace the internal app port (e.g., 3000) with your app’s port if applicable. If your app only runs as a Discord bot (no web), you can skip reverse proxy.

  sudo nano /etc/nginx/sites-available/mooissha.dev

  server {
      listen 80;
      listen [::]:80;
      server_name mooissha.dev www.mooissha.dev;

      location / {
          proxy_pass http://127.0.0.1:3000;  # change to your app port
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
          proxy_set_header Host $host;
          proxy_cache_bypass $http_upgrade;
      }
  }

  sudo ln -s /etc/nginx/sites-available/mooissha.dev /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl reload nginx

- Request certificate:
  sudo certbot --nginx -d mooissha.dev -d www.mooissha.dev

Certbot will auto‑configure HTTPS. Certificates auto‑renew via a system timer.


## 8) Fill out config.json (field‑by‑field)

Open david/config.json and replace placeholders. Below is an example template with explanations inline.

{
  "tokens": ["DISCORD_BOT_TOKEN_1", "DISCORD_BOT_TOKEN_2_OPTIONAL"],
  "domains": ["mooissha.dev"],
  "owners": ["YOUR_DISCORD_USER_ID"],

  "novps": "false",                  // set to "false" because you DO have a VPS
  "useproxy": "false",               // set to "true" only if you want HTTP/SOCKS proxies
  "proxy": "",                       // proxy URL if useproxy=true (e.g., socks5://user:pass@host:port)

  "discordServer": "https://discord.gg/YOUR_INVITE", // your server invite
  "authkey": "",                     // app‑specific auth key if required by your deployment (optional)
  "transcripts": "CHANNEL_ID",       // channel for transcripts/logs
  "trial": "",                       // license or trial key behavior (optional; used by licensing flow)
  "jwtsecret": "GENERATE_A_RANDOM_LONG_SECRET", // required if any JWT is issued by APIs
  "defaultpfp": "",                  // default profile pic URL (optional)
  "captchakey": "",                  // captcha provider key if used (optional)
  "botslotslink": "",                // link for purchasing bot slots (optional)
  "notifierWebhook": "https://discord.com/api/webhooks/...", // Discord webhook to send notifications

  "guildid": "GUILD_ID",             // your Discord server ID
  "welcomechannel": "CHANNEL_ID",    // welcome channel
  "leaderboard": "CHANNEL_ID",       // leaderboard channel (if used)
  "log": "CHANNEL_ID",               // logs channel

  "footer1": "",                     // small footer text for bot messages (optional)
  "shoplink": "https://mooissha.dev/shop", // public shop URL (already set)

  "roleid": "ROLE_ID",               // role to grant for access
  "memberrole": "ROLE_ID",           // default member role

  "ip6": "",                         // your VPS IPv6 (optional)
  "ip4": "YOUR_VPS_IPV4",            // set to your Azure public IPv4 (recommended)

  "hypixelemail": "",                // if Hypixel integration is used (optional)
  "hypixelpassword": "",             // if Hypixel integration is used (optional)

  "ticketcategory": "CHANNEL_ID",    // category channel for tickets
  "welcomchannel": "CHANNEL_ID",     // NOTE: appears to duplicate welcomechannel; keep both if code expects both

  "vpsip": "YOUR_VPS_IPV4",          // set to your VPS IPv4
  "vpsip2": "",                      // secondary IP if used (optional)

  "footer": {                          // embed footer (used across UIs)
    "text": "",
    "icon_url": ""
  },

  "blockedEmails": [""],             // emails to auto‑block (optional)
  "ignoreEmails": [""],              // emails to ignore (optional)

  "smtpHost": "smtp.sendgrid.net",   // Replace with your SMTP provider host
  "smtpPort": 587                     // 587 (TLS) recommended; Azure often blocks 25
}

Explanation and how to obtain values:
- tokens: From Discord Developer Portal → Bot → Token. Put 1 or more tokens. This array is required. Do NOT share.
- domains: Your allowed domains. Use ["mooissha.dev"] (you already have this). Add subdomains if your flows use them.
- owners: Discord user IDs that are treated as owners. Right‑click yourself in Discord (Developer Mode on) → Copy ID.
- novps: "false" because you are running on a VPS. Some code branches check this to enable VPS‑dependent paths.
- useproxy & proxy: Only if you must route outgoing HTTP through a proxy. Leave false/empty otherwise.
- discordServer: Your server’s invite URL for quick linking in bot messages.
- authkey: If any internal API expects a shared secret, put it here. Otherwise leave blank.
- transcripts / log / leaderboard / welcomechannel / ticketcategory: Channel IDs from your Discord server. Create channels as needed. Right‑click channel → Copy ID.
- trial: Related to license trials in this project. If you don’t use trials, leave empty.
- jwtsecret: Generate a long random string (e.g., openssl rand -hex 64) and keep it secret.
- defaultpfp: If the app assigns a default profile pic URL; optional.
- captchakey: If the project integrates a captcha service (e.g., hCaptcha/2Captcha); optional.
- botslotslink: Link to a page where users can buy more slots; optional.
- notifierWebhook: A Discord webhook URL for notifications (create in any text channel → Integrations → Webhooks).
- guildid: Your server ID.
- roleid / memberrole: Create roles in your server and copy their IDs.
- shoplink: Already points to https://mooissha.dev/shop — adjust if needed.
- ip4 / ip6 / vpsip / vpsip2: Fill ip4 and vpsip with your Azure public IPv4. If you have IPv6, set ip6. vpsip2 is optional.
- hypixelemail / hypixelpassword: Only for Hypixel‑specific integrations; otherwise leave blank.
- welcomchannel: There are two similar fields (welcomechannel and welcomchannel). Keep them consistent (set to the same channel ID) unless you know they are used differently.
- footer & footer1: Cosmetic text/icon for embeds and messages.
- blockedEmails / ignoreEmails: Lists used by the email handler logic.
- smtpHost / smtpPort: SMTP server to use for sending emails. Use port 587 (STARTTLS) or 465 (SMTPS). Azure often blocks outbound 25.

Discord permission/intents checklist:
- In the Developer Portal → Bot → Privileged Gateway Intents: enable Server Members, Presence (if needed), and Message Content (if commands read message content).
- Invite the bot with sufficient permissions to manage roles/channels if the bot needs them.


## 9) Optional: External SMTP provider setup

Azure commonly blocks outbound SMTP on port 25. Use a third‑party SMTP provider:
- SendGrid: smtpHost=smtp.sendgrid.net, smtpPort=587, Username="apikey", Password=YOUR_API_KEY
- Mailgun: smtp.mailgun.org:587
- Gmail: smtp.gmail.com:587 (requires App Password if 2FA enabled)

Configure credentials wherever the code loads them (some projects store SMTP auth elsewhere like environment variables). If this project needs only host/port from config.json, add auth handling per provider in the relevant code if not already present.


## 10) Start the app with PM2

From the david directory:
- First run to verify:
  npm start

- Start under PM2 and keep it running:
  pm2 start npm --name "autosecure" -- start

- Auto‑start on reboot:
  pm2 save
  pm2 startup systemd
  # follow the printed command (e.g., sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u <user> --hp /home/<user>)

- Logs:
  pm2 logs autosecure

- Restart after config changes:
  pm2 restart autosecure


## 11) Troubleshooting checklist

- Bot not online: check tokens, enabled intents, and that the bot is invited to the guild.
- Missing permissions: ensure the bot role is above target roles and has required permissions.
- Channels/roles not found: verify IDs are correct and the bot can access them.
- DNS/SSL errors: confirm A records point to the correct IP and renew Let’s Encrypt certs with certbot renew if needed.
- SMTP fails on port 25: switch to 587 and a provider like SendGrid.


## 12) Security best practices

- Store secrets only on the server. Do not push config.json with real tokens to Git.
- Restrict who has shell access to the VPS. Use SSH keys. Keep Ubuntu and Node patched.
- Rotate tokens and webhooks if leaked. Consider using environment variables for secrets in the future.


## 13) Minimal working values for your case

Since you have mooissha.dev and an Azure Ubuntu VPS, you can start with:
- domains: ["mooissha.dev"]
- novps: "false"
- ip4 and vpsip: your Azure public IPv4
- tokens: your Discord bot token
- guildid + required channel/role IDs from your server
- notifierWebhook (optional but useful)
- smtpHost: provider host (if you plan to send emails) — else leave defaults and disable email features

Once these are set and the bot has intents and permissions, run pm2 start as above.