const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Client, GatewayIntentBits } = require("discord.js");

// Polyfill fetch for Node.js < 18
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

const config = require("../config.json");
const access = require("../db/access");
const { queryParams } = require("../db/database");
const { autosecureMap } = require("../mainbot/handlers/botHandler");
const autosecure = require("../autosecure/autosecure");
const checkToken = require("../autosecure/utils/utils/checkToken");
const { getBotIdFromToken } = require("../autosecure/utils/process/helpers");
const { client: controllerClient } = require("../mainbot/controllerbot");
const { transferLicense } = require("../autosecure/utils/bot/transferlicense");
const deleteuser = require("../db/deleteuser");
const destroybots = require("../db/destroybots");
const generate = require("../autosecure/utils/generate");
const { footer1 } = config;

const SESSION_COOKIE = "as_web";
const JWT_SECRET = config.jwtsecret || process.env.JWT_SECRET;
const PORT = Number(process.env.WEB_PORT || config.webPort || 3300);
const SECURE_COOKIE = process.env.NODE_ENV === "production";

let started = false;

function hasJwtSecret() {
  return Boolean(JWT_SECRET && String(JWT_SECRET).trim().length > 0);
}

function signSession(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIE,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE);
}

function normalizeId(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function getPasswordHash(userId) {
  const rows = await queryParams("SELECT encodedpassword FROM settings WHERE user_id = ?", [userId]);
  return rows?.[0]?.encodedpassword || null;
}

async function savePassword(userId, hash) {
  const rows = await queryParams("SELECT encodedpassword FROM settings WHERE user_id = ?", [userId]);
  if (rows.length === 0) {
    await queryParams("INSERT INTO settings (user_id, encodedpassword) VALUES (?, ?)", [userId, hash]);
  } else {
    await queryParams("UPDATE settings SET encodedpassword = ? WHERE user_id = ?", [hash, userId]);
  }
}

async function ensurePassword(userId, password) {
  const current = await getPasswordHash(userId);
  if (current) {
    const matches = await bcrypt.compare(password, current);
    return { ok: matches, firstTime: false };
  }
  const hash = await bcrypt.hash(password, 10);
  await savePassword(userId, hash);
  return { ok: true, firstTime: true };
}

async function getLicenseInfo(userId) {
  const data = await queryParams("SELECT expiry FROM usedLicenses WHERE user_id = ?", [userId]);
  const expiry = data?.[0]?.expiry ? Number(data[0].expiry) : null;
  return expiry ? { expiry, expiresIn: Math.max(0, expiry - Date.now()) } : null;
}

async function getSlotInfo(userId) {
  const slotsRow = await queryParams("SELECT slots FROM slots WHERE user_id = ?", [userId]);
  const maxSlots = slotsRow?.[0]?.slots ? Number(slotsRow[0].slots) : 1;
  const bots = await queryParams(
    "SELECT botnumber, token FROM autosecure WHERE user_id = ? ORDER BY botnumber ASC",
    [userId]
  );
  const usedNumbers = bots.map((b) => b.botnumber);
  const filledBots = bots.filter((b) => b.token && String(b.token).trim() !== "");
  const usedSlots = filledBots.length;
  const openSlots = Math.max(0, maxSlots - usedSlots);

  const availableNumbers = [];
  for (let i = 1; i <= maxSlots; i += 1) {
    if (!usedNumbers.includes(i)) {
      availableNumbers.push(i);
    }
  }

  return { maxSlots, usedSlots, openSlots, availableNumbers, bots };
}

function mapBotStatus(userId, bot) {
  const key = `${userId}|${bot.botnumber}`;
  const client = autosecureMap.get(key);
  const online = Boolean(client);
  const botId = client?.user?.id || (bot.token ? getBotIdFromToken(bot.token) : null);
  return {
    botnumber: bot.botnumber,
    name: client?.user?.username || bot.lastsavedname || "Unknown",
    online,
    botId,
    hasToken: Boolean(bot.token && String(bot.token).trim() !== ""),
    createdAt: bot.creationdate ? Number(bot.creationdate) * 1000 : null,
    readyAt: client?.readyAt ? Number(client.readyAt) : null
  };
}

async function restartBot(userId, botnumber) {
  const tokenRow = await queryParams(
    "SELECT token FROM autosecure WHERE user_id = ? AND botnumber = ?",
    [userId, botnumber]
  );
  const token = tokenRow?.[0]?.token;
  if (!token) {
    throw new Error("Bot token is missing. Update the token before restarting.");
  }

  const key = `${userId}|${botnumber}`;
  const existing = autosecureMap.get(key);
  if (existing) {
    try {
      await existing.destroy();
    } catch (err) {
      console.warn(`Failed to destroy bot ${key}: ${err.message}`);
    }
    autosecureMap.delete(key);
  }

  const instance = await autosecure(token, userId, botnumber);
  if (!instance) {
    throw new Error("Failed to start bot with the provided token.");
  }
  autosecureMap.set(key, instance);
  return instance;
}

async function validateBotToken(token) {
  if (!token || token.length < 20) {
    return { ok: false, message: "Token is required." };
  }

  const valid = await checkToken(token);
  if (!valid) {
    return { ok: false, message: "Invalid Discord bot token." };
  }

  try {
    const tempClient = new Client({ intents: [GatewayIntentBits.Guilds] });
    await tempClient.login(token);
    await tempClient.destroy();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: "Enable required gateway intents for this bot." };
  }
}

async function upsertBot(userId, botnumber, token) {
  const validation = await validateBotToken(token);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const existing = await queryParams(
    "SELECT id FROM autosecure WHERE user_id = ? AND botnumber = ?",
    [userId, botnumber]
  );

  if (existing.length === 0) {
    await queryParams(
      "INSERT INTO autosecure (user_id, botnumber, token, creationdate, auto_secure, change_ign, multiplayer, secureifnomc, checkban, autoquarantine, oauthapps, exploit, removedevices, addzyger, signout, changegamertag, subscribemail, changeprimary, changename, changedob, changepfp, changelanguage, domain) VALUES (?, ?, ?, ?, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, ?)",
      [userId, botnumber, token, nowSeconds, config.domains[0]]
    );
  } else {
    await queryParams(
      "UPDATE autosecure SET token = ?, creationdate = ? WHERE user_id = ? AND botnumber = ?",
      [token, nowSeconds, userId, botnumber]
    );
  }

  const instance = await autosecure(token, userId, botnumber);
  if (!instance) {
    throw new Error("Failed to launch bot with the provided token.");
  }
  autosecureMap.set(`${userId}|${botnumber}`, instance);
  return instance;
}

async function redeemSlot(userId, key) {
  await queryParams("DELETE FROM unusedslots WHERE unusedslots = ?", [key]);
  const existing = await queryParams("SELECT slots FROM slots WHERE user_id = ?", [userId]);
  if (existing.length > 0) {
    await queryParams("UPDATE slots SET slots = slots + 1 WHERE user_id = ?", [userId]);
  } else {
    await queryParams("INSERT INTO slots (user_id, slots) VALUES (?, ?)", [userId, 1]);
  }
  const updated = await queryParams("SELECT slots FROM slots WHERE user_id = ?", [userId]);
  return updated?.[0]?.slots || 1;
}

async function redeemLicense(userId, license, duration) {
  const durationDays = parseFloat(duration);
  if (Number.isNaN(durationDays) || durationDays <= 0) {
    throw new Error("Invalid license duration.");
  }
  const durationMs = durationDays * 86400000;
  const existingLicense = await queryParams("SELECT * FROM usedLicenses WHERE user_id = ?", [userId]);
  const existingTrial = await queryParams("SELECT * FROM trial WHERE user_id = ?", [userId]);
  if (existingTrial.length > 0) {
    await queryParams("UPDATE trial SET trial = ? WHERE user_id = ?", ["true", userId]);
  } else {
    await queryParams("INSERT INTO trial (user_id, trial) VALUES (?, ?)", [userId, "true"]);
  }

  let expiry = Date.now() + durationMs;
  if (existingLicense.length > 0) {
    const currentExpiry = existingLicense[0].expiry ? Number(existingLicense[0].expiry) : Date.now();
    expiry = currentExpiry + durationMs;
    await queryParams("DELETE FROM usedLicenses WHERE user_id = ?", [userId]);
  }

  await queryParams(
    "INSERT INTO usedLicenses(license, user_id, expiry, one_day_warning_sent, seven_day_warning_sent) VALUES(?, ?, ?, 0, 0)",
    [license, userId, expiry.toString()]
  );

  const existingAccess = await queryParams("SELECT id FROM autosecure WHERE user_id = ? LIMIT 1", [userId]);
  if (existingAccess.length === 0) {
    await queryParams("INSERT INTO autosecure(user_id, domain) VALUES(?, ?)", [userId, config.domains[0]]);
    await queryParams("INSERT INTO secureconfig(user_id, domain) VALUES(?, ?)", [userId, config.domains[0]]);
  }

  await queryParams("DELETE FROM licenses WHERE license = ?", [license]);
  await tryAssignRole(userId);
  return expiry;
}

async function tryAssignRole(userId) {
  try {
    if (!controllerClient?.readyAt || !config.guildid || !config.roleid) return;
    const guild = await controllerClient.guilds.fetch(config.guildid).catch(() => null);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    await member.roles.add(config.roleid).catch(() => null);
  } catch (err) {
    console.warn(`Failed to assign role to ${userId}: ${err.message}`);
  }
}

function buildApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.use("/assets", express.static(path.join(__dirname, "public")));
  app.use(express.static(path.join(__dirname, "public"))); // Serve files from /public for landing page
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(limiter);

  app.use((req, res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token && JWT_SECRET) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.sessionUserId = payload.userId;
      } catch (err) {
        clearSessionCookie(res);
      }
    }
    next();
  });

  const requireApiAuth = (req, res, next) => {
    // Authentication removed - all API endpoints are now public
    next();
  };

  app.get("/", (req, res) => {
    res.render("index");
  });

  app.get("/features", (req, res) => {
    res.render("features");
  });

  app.get("/api/me", requireApiAuth, async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const [license, slotsInfo] = await Promise.all([
        getLicenseInfo(userId),
        getSlotInfo(userId)
      ]);

      const isOwner = config.owners && config.owners.includes(userId);

      res.json({
        error: false,
        userId,
        isOwner,
        license,
        slots: {
          max: slotsInfo.maxSlots,
          used: slotsInfo.usedSlots,
          open: slotsInfo.openSlots
        }
      });
    } catch (err) {
      console.error("Failed to load profile:", err);
      res.status(500).json({ error: true, message: "Failed to load profile." });
    }
  });

  app.get("/api/bots", requireApiAuth, async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const slotsInfo = await getSlotInfo(userId);
      const detailedBots = slotsInfo.bots.map((bot) => mapBotStatus(userId, bot));
      res.json({
        error: false,
        bots: detailedBots,
        slots: {
          max: slotsInfo.maxSlots,
          used: slotsInfo.usedSlots,
          open: slotsInfo.openSlots,
          availableNumbers: slotsInfo.availableNumbers
        }
      });
    } catch (err) {
      console.error("Failed to load bots:", err);
      res.status(500).json({ error: true, message: "Failed to load bots." });
    }
  });

  app.get("/api/bots/:botnumber/config", requireApiAuth, async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const rows = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      const config = rows[0];
      const key = `${userId}|${botnumber}`;
      const clientInstance = autosecureMap.get(key);
      let activity = null;
      if (config.activity) {
        try {
          activity = JSON.parse(config.activity);
        } catch (e) {
          activity = null;
        }
      }

      res.json({
        error: false,
        config: {
          token: config.token || "",
          webhook: config.webhook || "",
          ping: config.ping || "@everyone",
          domain: config.domain || "",
          aftersecure: config.aftersecure || "nothing",
          blacklistemails: Boolean(config.blacklistemails),
          oauth_link: config.oauth_link || "",
          hits_channel: config.hits_channel || "",
          logs_channel: config.logs_channel || "",
          users_channel: config.users_channel || "",
          notification_channel: config.notification_channel || "",
          server_id: config.server_id || "",
          postserver: config.postserver || "",
          verification_type: config.verification_type || 0,
          validateusername: config.validateusername || 0,
          claiming: Boolean(config.claiming),
          auto_secure: Boolean(config.auto_secure),
          change_ign: Boolean(config.change_ign),
          multiplayer: Boolean(config.multiplayer),
          secureifnomc: Boolean(config.secureifnomc),
          checkban: Boolean(config.checkban),
          autoquarantine: Boolean(config.autoquarantine),
          oauthapps: Boolean(config.oauthapps),
          exploit: Boolean(config.exploit),
          removedevices: Boolean(config.removedevices),
          addzyger: Boolean(config.addzyger),
          signout: Boolean(config.signout),
          changegamertag: Boolean(config.changegamertag),
          subscribemail: Boolean(config.subscribemail),
          changeprimary: Boolean(config.changeprimary),
          changename: Boolean(config.changename),
          changedob: Boolean(config.changedob),
          changepfp: Boolean(config.changepfp),
          changelanguage: Boolean(config.changelanguage),
          name: config.name || "",
          dob: config.dob || "",
          pfp: config.pfp || "",
          language: config.language || "",
          activity
        },
        online: Boolean(clientInstance),
        botId: clientInstance?.user?.id || null
      });
    } catch (err) {
      console.error("Failed to load bot config:", err);
      res.status(500).json({ error: true, message: "Failed to load configuration." });
    }
  });

  app.post("/api/bots", requireApiAuth, async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const token = typeof req.body.token === "string" ? req.body.token.trim() : "";
      if (!token) {
        return res.status(400).json({ error: true, message: "Bot token is required." });
      }

      const slotsInfo = await getSlotInfo(userId);
      if (slotsInfo.openSlots <= 0) {
        return res.status(400).json({ error: true, message: "No free bot slots available." });
      }

      const botnumber = slotsInfo.availableNumbers[0] || slotsInfo.maxSlots + 1;
      await upsertBot(userId, botnumber, token);
      const updatedSlots = await getSlotInfo(userId);
      const bots = updatedSlots.bots.map((bot) => mapBotStatus(userId, bot));
      res.json({
        error: false,
        bot: bots.find((b) => b.botnumber === botnumber),
        slots: {
          max: updatedSlots.maxSlots,
          used: updatedSlots.usedSlots,
          open: updatedSlots.openSlots,
          availableNumbers: updatedSlots.availableNumbers
        }
      });
    } catch (err) {
      console.error("Failed to create bot:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to create bot." });
    }
  });

  app.patch("/api/bots/:botnumber", requireApiAuth, async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const body = req.body || {};
      const updates = [];
      const params = [];
      const whitelist = {
        webhook: { type: "string", max: 512 },
        ping: { type: "string", max: 128 },
        aftersecure: { type: "string", max: 128 },
        role_id: { type: "string", max: 64 },
        blacklistemails: { type: "boolean" },
        auto_secure: { type: "boolean" },
        domain: { type: "string", max: 120 },
        verifymsg: { type: "string", max: 1024 },
        prefix: { type: "string", max: 32 },
        oauth_link: { type: "string", max: 512 },
        hits_channel: { type: "string", max: 256 },
        logs_channel: { type: "string", max: 256 },
        users_channel: { type: "string", max: 256 },
        notification_channel: { type: "string", max: 256 },
        server_id: { type: "string", max: 64 },
        postserver: { type: "string", max: 64 },
        verification_type: { type: "number" },
        validateusername: { type: "number" },
        claiming: { type: "boolean" },
        change_ign: { type: "boolean" },
        multiplayer: { type: "boolean" },
        secureifnomc: { type: "boolean" },
        checkban: { type: "boolean" },
        autoquarantine: { type: "boolean" },
        oauthapps: { type: "boolean" },
        exploit: { type: "boolean" },
        removedevices: { type: "boolean" },
        addzyger: { type: "boolean" },
        signout: { type: "boolean" },
        changegamertag: { type: "boolean" },
        subscribemail: { type: "boolean" },
        changeprimary: { type: "boolean" },
        changename: { type: "boolean" },
        changedob: { type: "boolean" },
        changepfp: { type: "boolean" },
        changelanguage: { type: "boolean" },
        name: { type: "string", max: 128 },
        dob: { type: "string", max: 64 },
        pfp: { type: "string", max: 512 },
        language: { type: "string", max: 32 }
      };

      let tokenUpdated = false;
      if (typeof body.token === "string" && body.token.trim()) {
        tokenUpdated = true;
        await upsertBot(userId, botnumber, body.token.trim());
      }

      for (const [key, rule] of Object.entries(whitelist)) {
        if (body[key] === undefined) continue;
        if (rule.type === "boolean") {
          updates.push(`${key} = ?`);
          params.push(body[key] ? 1 : 0);
        } else if (rule.type === "number") {
          const num = Number(body[key]);
          if (!Number.isInteger(num) || num < 0) {
            return res.status(400).json({ error: true, message: `${key} must be a positive integer.` });
          }
          updates.push(`${key} = ?`);
          params.push(num);
        } else if (typeof body[key] === "string") {
          const value = body[key].trim();
          if (value.length > rule.max) {
            return res.status(400).json({ error: true, message: `${key} is too long.` });
          }
          updates.push(`${key} = ?`);
          params.push(value);
        }
      }

      if (updates.length > 0) {
        params.push(userId, botnumber);
        await queryParams(
          `UPDATE autosecure SET ${updates.join(", ")} WHERE user_id = ? AND botnumber = ?`,
          params
        );
      }

      if (!tokenUpdated && updates.length === 0) {
        return res.json({ error: false, message: "No changes applied." });
      }

      const slotsInfo = await getSlotInfo(userId);
      const bots = slotsInfo.bots.map((bot) => mapBotStatus(userId, bot));
      const current = bots.find((b) => b.botnumber === botnumber);
      res.json({ error: false, bot: current });
    } catch (err) {
      console.error("Failed to update bot:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to update bot." });
    }
  });

  app.post("/api/bots/:botnumber/restart", requireApiAuth, async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }
      await restartBot(userId, botnumber);
      const slotsInfo = await getSlotInfo(userId);
      const bots = slotsInfo.bots.map((bot) => mapBotStatus(userId, bot));
      const current = bots.find((b) => b.botnumber === botnumber);
      res.json({ error: false, bot: current });
    } catch (err) {
      console.error("Failed to restart bot:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to restart bot." });
    }
  });

  app.post("/api/bots/:botnumber/activity", requireApiAuth, async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const { type, text, visibility } = req.body;
      if (!type || !text) {
        return res.status(400).json({ error: true, message: "Activity type and text are required." });
      }

      const activityData = { type, text, visibility: visibility || "online" };
      const activityJson = JSON.stringify(activityData);
      await queryParams(
        "UPDATE autosecure SET activity = ? WHERE user_id = ? AND botnumber = ?",
        [activityJson, userId, botnumber]
      );

      const key = `${userId}|${botnumber}`;
      const clientInstance = autosecureMap.get(key);
      if (clientInstance) {
        const typeMap = { playing: 0, streaming: 1, listening: 2, watching: 3, competing: 4 };
        const activityType = typeMap[type.toLowerCase()] || 0;
        const statusMap = { online: "online", idle: "idle", dnd: "dnd", invisible: "invisible" };
        const status = statusMap[visibility.toLowerCase()] || "online";
        try {
          await clientInstance.user.setPresence({
            activities: [{ name: text, type: activityType }],
            status
          });
        } catch (e) {
          console.warn(`Failed to set presence for ${key}: ${e.message}`);
        }
      }

      res.json({ error: false, activity: activityData });
    } catch (err) {
      console.error("Failed to set activity:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to set activity." });
    }
  });

  app.delete("/api/bots/:botnumber", requireApiAuth, async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const key = `${userId}|${botnumber}`;
      const existing = autosecureMap.get(key);
      if (existing) {
        try {
          await existing.destroy();
        } catch (err) {
          console.warn(`Failed to destroy bot ${key}: ${err.message}`);
        }
        autosecureMap.delete(key);
      }

      await queryParams(
        "DELETE FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );

      res.json({ error: false, message: "Bot deleted successfully." });
    } catch (err) {
      console.error("Failed to delete bot:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to delete bot." });
    }
  });

  // Get blacklisted users or emails for a bot
  app.get("/api/bots/:botnumber/blacklist/:type", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const type = req.params.type; // 'users' or 'emails'

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }
      if (type !== 'users' && type !== 'emails') {
        return res.status(400).json({ error: true, message: "Type must be 'users' or 'emails'." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      const tableName = type === 'users' ? 'blacklisted' : 'blacklistedemails';
      const rows = await queryParams(`SELECT * FROM ${tableName} WHERE botnumber = ?`, [botnumber]);

      res.json({ error: false, items: rows });
    } catch (err) {
      console.error("Failed to fetch blacklist:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to fetch blacklist." });
    }
  });

  // Add item to blacklist (user or email)
  app.post("/api/bots/:botnumber/blacklist/:type", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const type = req.params.type; // 'users' or 'emails'
      const { value } = req.body;

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }
      if (type !== 'users' && type !== 'emails') {
        return res.status(400).json({ error: true, message: "Type must be 'users' or 'emails'." });
      }
      if (!value || typeof value !== 'string') {
        return res.status(400).json({ error: true, message: `${type === 'users' ? 'User ID' : 'Email'} is required.` });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      if (type === 'users') {
        await queryParams(
          "INSERT INTO blacklisted (userid, botnumber) VALUES (?, ?)",
          [value, botnumber]
        );
      } else {
        await queryParams(
          "INSERT INTO blacklistedemails (email, botnumber) VALUES (?, ?)",
          [value, botnumber]
        );
      }

      res.json({ error: false, message: `${type === 'users' ? 'User' : 'Email'} blacklisted successfully.` });
    } catch (err) {
      console.error("Failed to add to blacklist:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to add to blacklist." });
    }
  });

  // Get embed by type for a bot
  app.get("/api/bots/:botnumber/embeds/:type", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const type = req.params.type;

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      const embedRows = await queryParams(
        "SELECT * FROM embeds WHERE user_id = ? AND type = ? AND botnumber = ?",
        [userId, type, botnumber]
      );

      if (embedRows.length === 0) {
        // Return default embed
        return res.json({ error: false, embed: null, isDefault: true });
      }

      const embedData = JSON.parse(embedRows[0].embed);
      res.json({ error: false, embed: embedData, isDefault: false, id: embedRows[0].id });
    } catch (err) {
      console.error("Failed to fetch embed:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to fetch embed." });
    }
  });

  // Update or create embed
  app.patch("/api/bots/:botnumber/embeds/:type", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const type = req.params.type;
      const { embed } = req.body;

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }
      if (!embed || typeof embed !== 'object') {
        return res.status(400).json({ error: true, message: "Embed data is required." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      const embedString = JSON.stringify(embed);
      const existingEmbed = await queryParams(
        "SELECT * FROM embeds WHERE user_id = ? AND type = ? AND botnumber = ?",
        [userId, type, botnumber]
      );

      if (existingEmbed.length === 0) {
        await queryParams(
          "INSERT INTO embeds (user_id, type, botnumber, embed) VALUES (?, ?, ?, ?)",
          [userId, type, botnumber, embedString]
        );
      } else {
        await queryParams(
          "UPDATE embeds SET embed = ? WHERE user_id = ? AND type = ? AND botnumber = ?",
          [embedString, userId, type, botnumber]
        );
      }

      res.json({ error: false, message: "Embed updated successfully." });
    } catch (err) {
      console.error("Failed to update embed:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to update embed." });
    }
  });

  // Delete custom embed (revert to default)
  app.delete("/api/bots/:botnumber/embeds/:type", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const type = req.params.type;

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      await queryParams(
        "DELETE FROM embeds WHERE user_id = ? AND type = ? AND botnumber = ?",
        [userId, type, botnumber]
      );

      res.json({ error: false, message: "Custom embed deleted, reverted to default." });
    } catch (err) {
      console.error("Failed to delete embed:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to delete embed." });
    }
  });

  // ===== BUTTONS ENDPOINTS =====
  
  // Get button by type
  app.get("/api/bots/:botnumber/buttons/:type", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const type = req.params.type;

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      const buttonRows = await queryParams(
        "SELECT * FROM buttons WHERE user_id = ? AND type = ? AND botnumber = ?",
        [userId, type, botnumber]
      );

      if (buttonRows.length === 0) {
        return res.json({ error: false, button: null, isDefault: true });
      }

      const buttonData = JSON.parse(buttonRows[0].button);
      res.json({ error: false, button: buttonData, isDefault: false });
    } catch (err) {
      console.error("Failed to fetch button:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to fetch button." });
    }
  });

  // Update or create button
  app.patch("/api/bots/:botnumber/buttons/:type", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const type = req.params.type;
      const { button } = req.body;

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }
      if (!button || typeof button !== 'object') {
        return res.status(400).json({ error: true, message: "Button data is required." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      const buttonString = JSON.stringify(button);
      const existingButton = await queryParams(
        "SELECT * FROM buttons WHERE user_id = ? AND type = ? AND botnumber = ?",
        [userId, type, botnumber]
      );

      if (existingButton.length === 0) {
        await queryParams(
          "INSERT INTO buttons (user_id, type, botnumber, button) VALUES (?, ?, ?, ?)",
          [userId, type, botnumber, buttonString]
        );
      } else {
        await queryParams(
          "UPDATE buttons SET button = ? WHERE user_id = ? AND type = ? AND botnumber = ?",
          [buttonString, userId, type, botnumber]
        );
      }

      res.json({ error: false, message: "Button updated successfully." });
    } catch (err) {
      console.error("Failed to update button:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to update button." });
    }
  });

  // Delete custom button
  app.delete("/api/bots/:botnumber/buttons/:type", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const type = req.params.type;

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      await queryParams(
        "DELETE FROM buttons WHERE user_id = ? AND type = ? AND botnumber = ?",
        [userId, type, botnumber]
      );

      res.json({ error: false, message: "Custom button deleted, reverted to default." });
    } catch (err) {
      console.error("Failed to delete button:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to delete button." });
    }
  });

  // ===== MODALS ENDPOINTS =====
  
  // Get modal by type
  app.get("/api/bots/:botnumber/modals/:type", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const type = req.params.type;

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      const modalRows = await queryParams(
        "SELECT * FROM modals WHERE user_id = ? AND type = ? AND botnumber = ?",
        [userId, type, botnumber]
      );

      if (modalRows.length === 0) {
        return res.json({ error: false, modal: null, isDefault: true });
      }

      const modalData = JSON.parse(modalRows[0].modal);
      res.json({ error: false, modal: modalData, isDefault: false });
    } catch (err) {
      console.error("Failed to fetch modal:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to fetch modal." });
    }
  });

  // Update or create modal
  app.patch("/api/bots/:botnumber/modals/:type", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const type = req.params.type;
      const { modal } = req.body;

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }
      if (!modal || typeof modal !== 'object') {
        return res.status(400).json({ error: true, message: "Modal data is required." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      const modalString = JSON.stringify(modal);
      const existingModal = await queryParams(
        "SELECT * FROM modals WHERE user_id = ? AND type = ? AND botnumber = ?",
        [userId, type, botnumber]
      );

      if (existingModal.length === 0) {
        await queryParams(
          "INSERT INTO modals (user_id, type, botnumber, modal) VALUES (?, ?, ?, ?)",
          [userId, type, botnumber, modalString]
        );
      } else {
        await queryParams(
          "UPDATE modals SET modal = ? WHERE user_id = ? AND type = ? AND botnumber = ?",
          [modalString, userId, type, botnumber]
        );
      }

      res.json({ error: false, message: "Modal updated successfully." });
    } catch (err) {
      console.error("Failed to update modal:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to update modal." });
    }
  });

  // Delete custom modal
  app.delete("/api/bots/:botnumber/modals/:type", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const type = req.params.type;

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      await queryParams(
        "DELETE FROM modals WHERE user_id = ? AND type = ? AND botnumber = ?",
        [userId, type, botnumber]
      );

      res.json({ error: false, message: "Custom modal deleted, reverted to default." });
    } catch (err) {
      console.error("Failed to delete modal:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to delete modal." });
    }
  });

  // ===== PRESETS ENDPOINTS =====
  
  // Get all presets for a bot
  app.get("/api/bots/:botnumber/presets", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      const presets = await queryParams(
        "SELECT * FROM presets WHERE user_id = ? AND botnumber = ? ORDER BY time DESC",
        [userId, botnumber]
      );

      res.json({ error: false, presets });
    } catch (err) {
      console.error("Failed to fetch presets:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to fetch presets." });
    }
  });

  // Create preset
  app.post("/api/bots/:botnumber/presets", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const { name, preset, buttonlabel, buttonlink } = req.body;

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: true, message: "Preset name is required." });
      }
      if (!preset || typeof preset !== 'string') {
        return res.status(400).json({ error: true, message: "Preset message is required." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      const time = Date.now();
      await queryParams(
        "INSERT INTO presets (user_id, botnumber, name, preset, buttonlabel, buttonlink, time) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [userId, botnumber, name, preset, buttonlabel || null, buttonlink || null, time]
      );

      res.json({ error: false, message: "Preset created successfully." });
    } catch (err) {
      console.error("Failed to create preset:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to create preset." });
    }
  });

  // Update preset
  app.patch("/api/bots/:botnumber/presets/:id", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const id = Number(req.params.id);
      const { name, preset, buttonlabel, buttonlink } = req.body;

      if (!Number.isInteger(botnumber) || botnumber <= 0 || !Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: true, message: "Invalid parameters." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      const presetCheck = await queryParams(
        "SELECT * FROM presets WHERE id = ? AND user_id = ? AND botnumber = ?",
        [id, userId, botnumber]
      );
      if (presetCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Preset not found." });
      }

      await queryParams(
        "UPDATE presets SET name = ?, preset = ?, buttonlabel = ?, buttonlink = ? WHERE id = ? AND user_id = ? AND botnumber = ?",
        [name || presetCheck[0].name, preset || presetCheck[0].preset, buttonlabel || null, buttonlink || null, id, userId, botnumber]
      );

      res.json({ error: false, message: "Preset updated successfully." });
    } catch (err) {
      console.error("Failed to update preset:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to update preset." });
    }
  });

  // Delete preset
  app.delete("/api/bots/:botnumber/presets/:id", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const id = Number(req.params.id);

      if (!Number.isInteger(botnumber) || botnumber <= 0 || !Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: true, message: "Invalid parameters." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      await queryParams(
        "DELETE FROM presets WHERE id = ? AND user_id = ? AND botnumber = ?",
        [id, userId, botnumber]
      );

      res.json({ error: false, message: "Preset deleted successfully." });
    } catch (err) {
      console.error("Failed to delete preset:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to delete preset." });
    }
  });

  // ===== REGISTER COMMANDS ENDPOINT =====
  
  app.post("/api/bots/:botnumber/register-commands", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const key = `${userId}|${botnumber}`;
      const clientInstance = autosecureMap.get(key);

      if (!clientInstance) {
        return res.status(400).json({ error: true, message: "Bot is not running. Please restart it first." });
      }

      // Register commands using Discord.js REST
      const { REST } = require('@discordjs/rest');
      const { Routes } = require('discord-api-types/v10');
      const fs = require('fs');
      const path = require('path');

      const commands = [];
      const commandsPath = path.join(__dirname, '../autosecure/Commands');
      
      // Load all command files
      const loadCommandsFromDir = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            loadCommandsFromDir(filePath);
          } else if (file.endsWith('.js')) {
            try {
              const command = require(filePath);
              if (command.name && command.description) {
                commands.push({
                  name: command.name,
                  description: command.description,
                  options: command.options || []
                });
              }
            } catch (err) {
              console.warn(`Failed to load command ${filePath}:`, err.message);
            }
          }
        }
      };

      loadCommandsFromDir(commandsPath);

      const rest = new REST({ version: '10' }).setToken(clientInstance.token);
      
      await rest.put(
        Routes.applicationCommands(clientInstance.user.id),
        { body: commands }
      );

      res.json({ 
        error: false, 
        message: `Successfully registered ${commands.length} commands!`,
        count: commands.length
      });
    } catch (err) {
      console.error("Failed to register commands:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to register commands." });
    }
  });

  // Remove item from blacklist
  app.delete("/api/bots/:botnumber/blacklist/:type/:id", async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const botnumber = Number(req.params.botnumber);
      const type = req.params.type; // 'users' or 'emails'
      const id = req.params.id;

      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }
      if (type !== 'users' && type !== 'emails') {
        return res.status(400).json({ error: true, message: "Type must be 'users' or 'emails'." });
      }

      const botCheck = await queryParams(
        "SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?",
        [userId, botnumber]
      );
      if (botCheck.length === 0) {
        return res.status(404).json({ error: true, message: "Bot not found." });
      }

      if (type === 'users') {
        await queryParams(
          "DELETE FROM blacklisted WHERE userid = ? AND botnumber = ?",
          [id, botnumber]
        );
      } else {
        await queryParams(
          "DELETE FROM blacklistedemails WHERE email = ? AND botnumber = ?",
          [id, botnumber]
        );
      }

      res.json({ error: false, message: `${type === 'users' ? 'User' : 'Email'} removed from blacklist.` });
    } catch (err) {
      console.error("Failed to remove from blacklist:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to remove from blacklist." });
    }
  });

  app.post("/api/redeem", async (req, res) => {
    try {
      const userId = normalizeId(req.sessionUserId || req.body.userId);
      const license = normalizeId(req.body.license);
      const newPassword = typeof req.body.password === "string" ? req.body.password : null;
      if (!userId || !license) {
        return res.status(400).json({ error: true, message: "User ID and license key are required." });
      }

      const blacklistCheck = await queryParams(
        "SELECT reason FROM autosecureblacklist WHERE user_id = ?",
        [userId]
      );
      if (blacklistCheck.length > 0) {
        return res.status(403).json({
          error: true,
          message: `User is blacklisted: ${blacklistCheck[0].reason || "No reason provided"}`
        });
      }

      const used = await queryParams("SELECT license FROM usedLicenses WHERE license = ?", [license]);
      if (used.length > 0) {
        return res.status(400).json({ error: true, message: "License key already used." });
      }

      const slotKey = await queryParams("SELECT unusedslots FROM unusedslots WHERE unusedslots = ?", [license]);
      const licenseData = await queryParams("SELECT license, duration FROM licenses WHERE license = ?", [license]);

      if (slotKey.length === 0 && licenseData.length === 0) {
        return res.status(404).json({ error: true, message: "Invalid license key." });
      }

      if (slotKey.length > 0) {
        const hasAccess = await access(userId);
        if (!hasAccess) {
          return res.status(400).json({ error: true, message: "Activate a license before adding slots." });
        }
        const slots = await redeemSlot(userId, license);
        return res.json({ error: false, type: "slot", slots });
      }

      const expiry = await redeemLicense(userId, license, licenseData[0].duration);
      if (newPassword && !(await getPasswordHash(userId))) {
        if (newPassword.length < 6) {
          return res.status(400).json({ error: true, message: "Password must be at least 6 characters." });
        }
        const hash = await bcrypt.hash(newPassword, 10);
        await savePassword(userId, hash);
      }

      return res.json({ error: false, type: "license", expiresAt: expiry });
    } catch (err) {
      console.error("Redeem failed:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to redeem license." });
    }
  });

  // Accounts endpoint
  app.get("/api/accounts", requireApiAuth, async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const userUIDsQuery = "SELECT uid FROM accountsbyuser WHERE user_id=? ORDER BY time DESC";
      const userUIDs = await queryParams(userUIDsQuery, [userId]);
      
      if (userUIDs.length === 0) {
        return res.json({ error: false, accounts: [] });
      }

      const uidList = userUIDs.map(row => row.uid);
      const placeholders = uidList.map(() => '?').join(', ');
      const accountsQuery = `SELECT uid, username, ownsmc, capes, email, recoverycode, secemail, secretkey, password, time FROM accounts WHERE uid IN (${placeholders}) ORDER BY time DESC`;
      const accounts = await queryParams(accountsQuery, uidList);

      res.json({ error: false, accounts });
    } catch (err) {
      console.error("Failed to load accounts:", err);
      res.status(500).json({ error: true, message: "Failed to load accounts." });
    }
  });

  // Admin panel page
  app.get("/api/admin/users", requireApiAuth, async (req, res) => {
    try {
      const userId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(userId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const licenses = await queryParams("SELECT user_id, license, expiry FROM usedLicenses ORDER BY expiry DESC");
      const slots = await queryParams("SELECT user_id, slots FROM slots");
      const bots = await queryParams("SELECT user_id, botnumber, token, creationdate FROM autosecure ORDER BY user_id, botnumber");
      
      const userMap = {};
      licenses.forEach(l => {
        if (!userMap[l.user_id]) {
          userMap[l.user_id] = { userId: l.user_id, username: null, license: l.license, expiry: l.expiry, slots: 0, bots: [] };
        }
      });

      slots.forEach(s => {
        if (userMap[s.user_id]) {
          userMap[s.user_id].slots = s.slots;
        }
      });

      bots.forEach(b => {
        if (userMap[b.user_id]) {
          userMap[b.user_id].bots.push({ botnumber: b.botnumber, token: b.token ? "***" : null, createdAt: b.creationdate });
        }
      });

      // Fetch Discord usernames
      const userIds = Object.keys(userMap);
      for (const uid of userIds) {
        try {
          const user = await controllerClient.users.fetch(uid).catch(() => null);
          if (user) {
            userMap[uid].username = user.tag || user.username;
          }
        } catch (err) {
          // Ignore errors for individual users
        }
      }

      const users = Object.values(userMap);
      res.json({ error: false, users });
    } catch (err) {
      console.error("Failed to list users:", err);
      res.status(500).json({ error: true, message: "Failed to list users." });
    }
  });

  // Admin API: Get user's bots
  app.get("/api/admin/users/:userId/bots", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const targetUserId = req.params.userId;
      const slotsInfo = await getSlotInfo(targetUserId);
      const detailedBots = slotsInfo.bots.map((bot) => mapBotStatus(targetUserId, bot));
      res.json({
        error: false,
        userId: targetUserId,
        bots: detailedBots,
        slots: {
          max: slotsInfo.maxSlots,
          used: slotsInfo.usedSlots,
          open: slotsInfo.openSlots
        }
      });
    } catch (err) {
      console.error("Failed to load user bots:", err);
      res.status(500).json({ error: true, message: "Failed to load user bots." });
    }
  });

  // Admin API: Get all accounts
  app.get("/api/admin/accounts", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const limit = req.query.limit ? parseInt(req.query.limit) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      
      const accounts = await queryParams(
        `SELECT uid, user_id, username, ownsmc, capes, email, recoverycode, secemail, secretkey, password, time 
         FROM accounts ORDER BY time DESC LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      
      const total = await queryParams("SELECT COUNT(*) as count FROM accounts");
      
      res.json({ error: false, accounts, total: total[0].count, limit, offset });
    } catch (err) {
      console.error("Failed to load all accounts:", err);
      res.status(500).json({ error: true, message: "Failed to load accounts." });
    }
  });

  // Admin API: Update any user's bot
  app.patch("/api/admin/bots/:userId/:botnumber", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const targetUserId = req.params.userId;
      const botnumber = Number(req.params.botnumber);
      if (!Number.isInteger(botnumber) || botnumber <= 0) {
        return res.status(400).json({ error: true, message: "Invalid bot number." });
      }

      const body = req.body || {};
      const updates = [];
      const params = [];
      const whitelist = {
        webhook: { type: "string", max: 512 },
        ping: { type: "string", max: 128 },
        aftersecure: { type: "string", max: 128 },
        role_id: { type: "string", max: 64 },
        blacklistemails: { type: "boolean" },
        auto_secure: { type: "boolean" },
        domain: { type: "string", max: 120 },
        verification_type: { type: "number" },
        validateusername: { type: "number" },
        claiming: { type: "boolean" }
      };

      for (const [key, rule] of Object.entries(whitelist)) {
        if (body[key] === undefined) continue;
        if (rule.type === "boolean") {
          updates.push(`${key} = ?`);
          params.push(body[key] ? 1 : 0);
        } else if (rule.type === "number") {
          updates.push(`${key} = ?`);
          params.push(Number(body[key]));
        } else if (rule.type === "string") {
          const str = String(body[key]).substring(0, rule.max);
          updates.push(`${key} = ?`);
          params.push(str);
        }
      }

      if (updates.length > 0) {
        params.push(targetUserId, botnumber);
        await queryParams(
          `UPDATE autosecure SET ${updates.join(", ")} WHERE user_id = ? AND botnumber = ?`,
          params
        );
      }

      res.json({ error: false, message: "Bot updated successfully." });
    } catch (err) {
      console.error("Failed to update bot:", err);
      res.status(400).json({ error: true, message: err.message || "Failed to update bot." });
    }
  });

  // ===== LICENSE MANAGEMENT =====

  // Create license keys
  app.post("/api/admin/licenses", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const { amount = 1, duration } = req.body;
      if (!duration || isNaN(parseFloat(duration)) || parseFloat(duration) <= 0) {
        return res.status(400).json({ error: true, message: "Valid duration in days required." });
      }

      const durationNum = parseFloat(duration);
      const generatedLicenses = [];

      for (let i = 0; i < amount; i++) {
        const key = `${footer1}-${generate(16)}`;
        await queryParams('INSERT INTO licenses(license, duration) VALUES(?, ?)', [key, durationNum]);
        generatedLicenses.push(key);
      }

      res.json({ error: false, licenses: generatedLicenses, amount, duration: durationNum });
    } catch (err) {
      console.error("Failed to create licenses:", err);
      res.status(500).json({ error: true, message: "Failed to create licenses." });
    }
  });

  // View all unused licenses
  app.get("/api/admin/licenses", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const licenses = await queryParams(`SELECT license, duration FROM licenses ORDER BY duration DESC`);
      res.json({ error: false, licenses });
    } catch (err) {
      console.error("Failed to get licenses:", err);
      res.status(500).json({ error: true, message: "Failed to get licenses." });
    }
  });

  // Delete specific license
  app.delete("/api/admin/licenses/:key", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const key = req.params.key;
      const licenseExists = await queryParams(`SELECT * FROM licenses WHERE license=?`, [key]);
      
      if (licenseExists.length === 0) {
        return res.status(404).json({ error: true, message: 'License key does not exist.' });
      }

      await queryParams(`DELETE FROM licenses WHERE license=?`, [key]);
      res.json({ error: false, message: "License deleted successfully." });
    } catch (err) {
      console.error("Failed to delete license:", err);
      res.status(500).json({ error: true, message: "Failed to delete license." });
    }
  });

  // Delete all unused licenses
  app.delete("/api/admin/licenses", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      await queryParams("DELETE FROM licenses");
      res.json({ error: false, message: "All unused licenses deleted." });
    } catch (err) {
      console.error("Failed to delete all licenses:", err);
      res.status(500).json({ error: true, message: "Failed to delete all licenses." });
    }
  });

  // Extend all used licenses
  app.patch("/api/admin/licenses/extend", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const { duration } = req.body;
      const daysNum = parseFloat(duration);

      if (isNaN(daysNum) || daysNum <= 0) {
        return res.status(400).json({ error: true, message: 'Valid duration in days required.' });
      }

      const usedLicenses = await queryParams(`SELECT license, expiry, user_id FROM usedLicenses`, []);
      let updatedCount = 0;
      const MS_PER_DAY = 86400000;

      for (const license of usedLicenses) {
        const currentExpiry = license.expiry ? parseInt(license.expiry) : Date.now();
        const newExpiry = currentExpiry + (daysNum * MS_PER_DAY);
        const newExpiryStr = newExpiry.toString();

        await queryParams(`UPDATE usedLicenses SET expiry = ? WHERE license = ?`, [newExpiryStr, license.license]);
        updatedCount++;
      }

      res.json({ error: false, updatedCount, duration: daysNum });
    } catch (err) {
      console.error("Failed to extend licenses:", err);
      res.status(500).json({ error: true, message: "Failed to extend licenses." });
    }
  });

  // Check if key is redeemed
  app.get("/api/admin/licenses/check/:key", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const key = req.params.key;
      const isnormallicense = await queryParams(`SELECT * FROM licenses WHERE license = ?`, [key]);
      const isunusedslotkey = await queryParams(`SELECT * FROM unusedslots WHERE unusedslots = ?`, [key]);
      const redeemedlicense = await queryParams(`SELECT * FROM usedLicenses WHERE license = ?`, [key]);

      if (redeemedlicense && redeemedlicense.length > 0) {
        const info = redeemedlicense[0];
        res.json({
          error: false,
          status: "redeemed",
          key,
          userId: info.user_id,
          expiry: info.expiry || null,
          trial: info.istrial === 1
        });
      } else if (isnormallicense && isnormallicense.length > 0) {
        const info = isnormallicense[0];
        res.json({
          error: false,
          status: "valid_unused",
          key,
          duration: info.duration || null
        });
      } else if (isunusedslotkey && isunusedslotkey.length > 0) {
        res.json({
          error: false,
          status: "valid_slot_key",
          key
        });
      } else {
        res.json({
          error: false,
          status: "invalid",
          key
        });
      }
    } catch (err) {
      console.error("Failed to check key:", err);
      res.status(500).json({ error: true, message: "Failed to check key." });
    }
  });

  // ===== SLOT MANAGEMENT =====

  // Create slot keys
  app.post("/api/admin/slots", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const { amount = 1, userId } = req.body;
      const createdKeys = [];

      if (userId) {
        // Add slot directly to user
        const existing = await queryParams("SELECT * FROM slots WHERE user_id = ?", [userId]);
        if (existing.length > 0) {
          await queryParams("UPDATE slots SET slots = slots + 1 WHERE user_id = ?", [userId]);
        } else {
          await queryParams("INSERT INTO slots(user_id, slots) VALUES(?, ?)", [userId, 1]);
        }

        const updated = await queryParams("SELECT slots FROM slots WHERE user_id = ?", [userId]);
        const currentSlots = updated[0]?.slots || 0;

        res.json({ error: false, userId, slots: currentSlots, redeemed: true });
      } else {
        // Generate slot keys
        for (let i = 0; i < amount; i++) {
          const slotkey = `extraslot-${generate(16)}`;
          await queryParams('INSERT INTO unusedslots(unusedslots) VALUES(?)', [slotkey]);
          createdKeys.push(slotkey);
        }

        res.json({ error: false, keys: createdKeys, amount });
      }
    } catch (err) {
      console.error("Failed to create slot keys:", err);
      res.status(500).json({ error: true, message: "Failed to create slot keys." });
    }
  });

  // Remove slot from user
  app.delete("/api/admin/slots/:userId", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const userId = req.params.userId;
      const existing = await queryParams("SELECT slots FROM slots WHERE user_id = ?", [userId]);

      if (existing.length === 0 || existing[0].slots <= 1) {
        return res.status(400).json({ error: true, message: "User has only 1 or no bot slots." });
      }

      const newSlotCount = existing[0].slots - 1;
      await queryParams("UPDATE slots SET slots = ? WHERE user_id = ?", [newSlotCount, userId]);

      res.json({ error: false, userId, newSlots: newSlotCount });
    } catch (err) {
      console.error("Failed to remove slot:", err);
      res.status(500).json({ error: true, message: "Failed to remove slot." });
    }
  });

  // ===== USER MANAGEMENT =====

  // Remove user access
  app.delete("/api/admin/users/:userId", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const userId = req.params.userId;
      const hadAccess = await access(userId);
      
      if (!hadAccess) {
        return res.status(400).json({ error: true, message: "User doesn't have access." });
      }

      await deleteuser(controllerClient, userId);
      res.json({ error: false, message: "User access removed successfully." });
    } catch (err) {
      console.error("Failed to remove user:", err);
      res.status(500).json({ error: true, message: "Failed to remove user." });
    }
  });

  // ===== TRANSFER LICENSE =====

  // Transfer license between users
  app.post("/api/admin/transfer", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const { fromUserId, toUserId } = req.body;
      
      if (!fromUserId || !toUserId) {
        return res.status(400).json({ error: true, message: "Both fromUserId and toUserId required." });
      }

      if (!(await access(fromUserId))) {
        return res.status(400).json({ error: true, message: "Source user doesn't have a license." });
      }

      if (await access(toUserId)) {
        return res.status(400).json({ error: true, message: "Target user already has a license." });
      }

      const oldlicense = await queryParams("SELECT license FROM usedLicenses WHERE user_id=?", [fromUserId]);
      if (oldlicense.length === 0) {
        return res.status(400).json({ error: true, message: "Couldn't find source user's license." });
      }

      const oldLicenseKey = oldlicense[0].license;
      await destroybots(fromUserId);

      const newLicenseKey = await transferLicense(oldLicenseKey, fromUserId, toUserId);

      res.json({
        error: false,
        fromUserId,
        toUserId,
        oldLicenseKey,
        newLicenseKey
      });
    } catch (err) {
      console.error("Failed to transfer license:", err);
      res.status(500).json({ error: true, message: "Failed to transfer license." });
    }
  });

  // ===== BLACKLIST MANAGEMENT =====

  // Get blacklist
  app.get("/api/admin/blacklist", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const blacklistedUsers = await queryParams(`SELECT user_id, reason FROM autosecureblacklist ORDER BY user_id`);
      res.json({ error: false, blacklist: blacklistedUsers });
    } catch (err) {
      console.error("Failed to get blacklist:", err);
      res.status(500).json({ error: true, message: "Failed to get blacklist." });
    }
  });

  // Add user to blacklist
  app.post("/api/admin/blacklist", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const { userId, reason = "No reason provided" } = req.body;
      if (!userId) {
        return res.status(400).json({ error: true, message: "userId required." });
      }

      const existingBlacklist = await queryParams(`SELECT * FROM autosecureblacklist WHERE user_id=?`, [userId]);
      
      if (existingBlacklist.length > 0) {
        return res.status(400).json({ error: true, message: "User already blacklisted." });
      }

      await queryParams(`INSERT INTO autosecureblacklist(user_id, reason) VALUES(?, ?)`, [userId, reason]);
      
      const hadAccess = await access(userId);
      if (hadAccess) {
        await deleteuser(controllerClient, userId);
      }

      res.json({ error: false, userId, reason, hadAccess });
    } catch (err) {
      console.error("Failed to blacklist user:", err);
      res.status(500).json({ error: true, message: "Failed to blacklist user." });
    }
  });

  // Remove user from blacklist
  app.delete("/api/admin/blacklist/:userId", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const userId = req.params.userId;
      const existingBlacklist = await queryParams(`SELECT * FROM autosecureblacklist WHERE user_id=?`, [userId]);
      
      if (existingBlacklist.length === 0) {
        return res.status(404).json({ error: true, message: "User not blacklisted." });
      }

      await queryParams(`DELETE FROM autosecureblacklist WHERE user_id=?`, [userId]);
      res.json({ error: false, userId });
    } catch (err) {
      console.error("Failed to unblacklist user:", err);
      res.status(500).json({ error: true, message: "Failed to unblacklist user." });
    }
  });

  // ===== SPLIT MODE MANAGEMENT =====

  // Get split mode status
  app.get("/api/admin/splitmode", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const allUsers = await queryParams('SELECT DISTINCT user_id FROM autosecure ORDER BY user_id');
      const splitStatus = [];

      for (const user of allUsers) {
        const bots = await queryParams('SELECT botnumber, split_mode_enabled, split_mode_ratio FROM autosecure WHERE user_id = ?', [user.user_id]);
        const enabledBot = bots.find(b => b.split_mode_enabled === 1);
        const isEnabled = !!enabledBot;
        const ratio = enabledBot ? enabledBot.split_mode_ratio : 2;

        // Fetch Discord username
        let username = null;
        try {
          const discordUser = await controllerClient.users.fetch(user.user_id).catch(() => null);
          if (discordUser) {
            username = discordUser.tag || discordUser.username;
          }
        } catch (err) {
          // Ignore errors
        }

        splitStatus.push({
          userId: user.user_id,
          username,
          botCount: bots.length,
          enabled: isEnabled,
          ratio
        });
      }

      res.json({ error: false, users: splitStatus });
    } catch (err) {
      console.error("Failed to get split mode status:", err);
      res.status(500).json({ error: true, message: "Failed to get split mode status." });
    }
  });

  // Update split mode for user
  app.patch("/api/admin/splitmode/:userId", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const userId = req.params.userId;
      const { enabled, ratio = 2 } = req.body;

      if (ratio < 2) {
        return res.status(400).json({ error: true, message: 'Ratio must be at least 2.' });
      }

      const bots = await queryParams('SELECT id, botnumber FROM autosecure WHERE user_id = ?', [userId]);
      
      if (!bots || bots.length === 0) {
        return res.status(404).json({ error: true, message: 'User has no bots.' });
      }

      // Ensure columns exist
      try {
        await queryParams('ALTER TABLE autosecure ADD COLUMN split_mode_enabled INTEGER DEFAULT 0');
      } catch (e) {}
      try {
        await queryParams('ALTER TABLE autosecure ADD COLUMN split_mode_ratio INTEGER DEFAULT 2');
      } catch (e) {}

      const enabledInt = enabled ? 1 : 0;
      await queryParams(
        'UPDATE autosecure SET split_mode_enabled = ?, split_mode_ratio = ? WHERE user_id = ?',
        [enabledInt, ratio, userId]
      );

      // Update users table
      try {
        await queryParams('ALTER TABLE users ADD COLUMN split_counter INTEGER DEFAULT 0');
      } catch (e) {}
      
      await queryParams(
        'UPDATE users SET split = ?, split_counter = 0 WHERE user_id = ?',
        [ratio, userId]
      );

      res.json({ error: false, userId, enabled, ratio, botCount: bots.length });
    } catch (err) {
      console.error("Failed to update split mode:", err);
      res.status(500).json({ error: true, message: "Failed to update split mode." });
    }
  });

  // ===== ACCOUNTS BY USER =====

  // Get accounts grouped by user
  app.get("/api/admin/accounts/by-user", requireApiAuth, async (req, res) => {
    try {
      const adminId = req.sessionUserId;
      const isOwner = config.owners && config.owners.includes(adminId);
      if (!isOwner) {
        return res.status(403).json({ error: true, message: "Access denied. Owners only." });
      }

      const filterUserId = req.query.userId;

      let accounts;
      if (filterUserId) {
        // Get accounts for specific user
        const userUIDs = await queryParams("SELECT uid FROM accountsbyuser WHERE user_id = ? ORDER BY time DESC", [filterUserId]);
        const uids = userUIDs.map(row => row.uid);
        
        if (uids.length === 0) {
          return res.json({ error: false, users: [] });
        }

        const placeholders = uids.map(() => '?').join(',');
        accounts = await queryParams(
          `SELECT uid, user_id, username, ownsmc, capes, email, recoverycode, secemail, secretkey, password, time 
           FROM accounts WHERE uid IN (${placeholders}) ORDER BY time DESC`,
          uids
        );

        const grouped = [{
          userId: filterUserId,
          accounts
        }];

        res.json({ error: false, users: grouped });
      } else {
        // Get all users with accounts
        const allAccountUsers = await queryParams("SELECT DISTINCT user_id FROM accountsbyuser ORDER BY user_id");
        const grouped = [];

        for (const { user_id } of allAccountUsers) {
          const userUIDs = await queryParams("SELECT uid FROM accountsbyuser WHERE user_id = ? ORDER BY time DESC LIMIT 100", [user_id]);
          const uids = userUIDs.map(row => row.uid);

          if (uids.length > 0) {
            const placeholders = uids.map(() => '?').join(',');
            const userAccounts = await queryParams(
              `SELECT uid, user_id, username, ownsmc, capes, email, recoverycode, secemail, secretkey, password, time 
               FROM accounts WHERE uid IN (${placeholders}) ORDER BY time DESC`,
              uids
            );

            grouped.push({
              userId: user_id,
              accountCount: userUIDs.length,
              accounts: userAccounts
            });
          }
        }

        res.json({ error: false, users: grouped });
      }
    } catch (err) {
      console.error("Failed to get accounts by user:", err);
      res.status(500).json({ error: true, message: "Failed to get accounts by user." });
    }
  });

  app.use((err, req, res, next) => {
    console.error("Unhandled web error:", err);
    res.status(500).json({ error: true, message: "Internal server error." });
  });

  return app;
}

async function startWebServer() {
  if (started) return;
  if (!hasJwtSecret()) {
    console.warn("Web panel not started: jwtsecret missing in config.json or JWT_SECRET env var.");
    return;
  }
  const app = buildApp();
  app.listen(PORT, () => {
    console.log(`Web panel listening on port ${PORT}`);
  });
  started = true;
  return app;
}

module.exports = { startWebServer };
