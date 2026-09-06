# Program overview: What this project does and how to use the Discord bot

This document explains what the project does at a high level, how it is structured, what Discord slash commands are available, and whether it hosts any HTTP servers.


## What this program does

- Runs one or more Discord bots that help users secure and manage Minecraft/Hypixel accounts ("Autosecure").
- Provides end-to-end workflows such as generating SSIDs, checking account status, triggering security actions (quarantine/remove quarantine, OTP flows), and automations for Hypixel-related tasks.
- Manages licensing and access control for the Autosecure service (keys, trials, slots, and owner/admin-only operations).
- Offers utilities: email inbox management on configured domains, cosmetics lookups, Hypixel status checks, and notifications.
- Can orchestrate multiple secondary bots ("bots" panel), including command registration and restarts.
- Uses a local database (SQLite) and configuration by david/config.json.


## High-level architecture

- Entry point: autosecure.js
  - Initializes database, grants owner access if needed, and starts the controller/primary bot.
  - Registers slash commands dynamically from files in mainbot/commands and autosecure/Commands.
  - Optionally interacts with PM2 for restarts.
- Discord integration: discord.js v14
  - Slash commands are defined in code under mainbot/commands (primary) and autosecure/Commands (secondary group).
  - Interaction handlers for buttons/modals live under mainbot/Buttons, mainbot/modals, and corresponding autosecure folders.
- Data and licensing
  - SQLite DB under david/db stores access, slots, usedLicenses, and user state.
  - config.json holds owner IDs, guild/channel/role IDs, SMTP and domain settings, etc.
- Optional HTTP server
  - A small Express server (localhost:25575) is used by the Microsoft/Xbox auth helper in autosecure/utils/minecraft/xbl2.js for OAuth callback during SSID/auth flows.


## Discord commands

Notes
- Command availability may depend on your role, license status, or ownership (owner-only commands are marked Owner). Some commands also require the bot’s role permissions in Discord.
- Arguments are shown in parentheses. Optional items are marked [optional].
- Names and descriptions below are derived from the command files; the bot may show richer interactive prompts via buttons and modals.


### Admin/Owner commands
- /admin access (options, amount, duration, user_id, key, reason, targetuser)
  - Manage Autosecure access: create keys/slots, extend licenses, blacklist/transfer, and audit redemptions. Owner.
- /admin config (options, section)
  - Change Autosecure configuration via interactive panels. Owner.


### User commands (primary)
- /accounts
  - List and manage all your accounts within Autosecure.
- /appeal (ssid)
  - Auto-appeal Hypixel security bans using the given SSID.
- /authcode (secret)
  - Generate a TOTP/OTP code from a provided 2FA secret.
- /bancheck (ssid)
  - Check if a Minecraft account is banned on Hypixel by SSID.
- /bots
  - Manage your additional bots; includes registration of commands and utility actions for your bot slots.
- /config (mode, bot, file)
  - Manage your bot config. Supports showing or loading configurations and per-bot settings.
- /cosmetics (ssid)
  - Look up Lunar cosmetics by SSID; uses store/assets data to map cosmetic and emote IDs to names.
- /email open (inbox)
  - Open a specific email inbox (on your configured domain) or list emails.
- /email register (email)
  - Register an email under your allowed domain(s) for security notifications.
- /email list
  - List your registered and notification emails.
- /getssid (method, [cookie])
  - Generate an SSID for a Minecraft account using various methods; cookie upload supported.
- /guide (option)
  - Show help panels for Autosecure features (email, config, etc.).
- /hypixelstatus (usernameOrUuid)
  - Check Hypixel online status for a player.
- /license [user]
  - Show your license info or, if owner, view another user’s info.
- /notify (message)
  - Notify users when a server is lost or other events occur.
- /quarantine (option)
  - Set up Hypixel quarantine steps for an account.
- /recover (key)
  - Recover Autosecure access using a purchased/recovery key.
- /redeem (key)
  - Redeem a license time/slots key you’ve purchased to extend access or add slots.
- /removequarantine (account)
  - Remove a Minecraft account from quarantine (choose the account interactively).
- /requestotp (email, method)
  - Request OTP via the chosen delivery mechanism to the specified email.
- /secure (type)
  - Secure an account. Provides guided flows for account security actions.
- /ssidchecker (ssid)
  - Check validity/metadata of your SSID.
- /stats (username)
  - View stats of a user or related service metrics.
- /trial
  - Request a temporary trial for Autosecure (if enabled by owners).


### Secondary (autosecure/Commands) commands
Depending on your deployment, you may see additional slash commands registered from the autosecure/Commands folder. Common ones include:
- /secure (type)
  - Similar security flows as the main command set, scoped to secondary bots.
- /ssidchecker (ssid)
  - Quick SSID checking helper.
- /stats
  - Basic stats view.
- /set ... (various admin-set toggles)
  - Admin tooling for certain Autosecure configuration paths. Owner/admin only.
- "send embed" (utility)
  - A helper to send a prebuilt embed to a channel; may be used for showcasing panels.

Buttons and Panels
- Many workflows expose a rich UI through buttons (e.g., Register Commands, Commands, Start Bot) and modals (enter titles, OTP, tokens). Look for bot panels that guide you through typical actions without memorizing arguments.


## Does it host a server?

Yes, a small local HTTP server is used in the Microsoft/Xbox authentication helper:
- File: autosecure/utils/minecraft/xbl2.js
- Tech: Express
- Default bind: http://localhost:25575
- Purpose: OAuth redirect/callback flow to help derive tokens/SSID for Microsoft/Xbox Live. The code opens a browser to authenticate and listens locally for the callback at /callback.

Important
- This helper server is intended for local development/CLI use. It is not exposed publicly by default. If you need to use it remotely, create an SSH tunnel or reverse proxy safely, and add authentication in front of it. Do not expose it directly to the internet.


## Related setup documentation

- For a full, step-by-step setup including Discord bot creation, DNS, Nginx/SSL, Node/PM2, and filling out config.json, see:
  - docs/CONFIG_SETUP.md


## Tips for operators

- After changing config.json, restart the app (PM2: pm2 restart autosecure).
- Keep bot intents enabled in the Discord Developer Portal (Server Members, Message Content, Presence if needed).
- Ensure the bot role has permissions and is placed above the roles it needs to manage.
- If multi-bot features are used, register commands for each bot via the UI button or via the provided command.
- Monitor logs with pm2 logs autosecure and address any missing IDs or permissions noted in errors.
