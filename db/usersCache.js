const { Client, GatewayIntentBits } = require("discord.js");
const config = require("../config.json"); // adjust path if config.json is elsewhere

// create client with proper intents
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// log when bot is ready
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// use the first token from config.json
if (!config.tokens || config.tokens.length === 0) {
  throw new Error("❌ No tokens found in config.json!");
}
const mainToken = config.tokens[0];
client.login(mainToken);

// user cache system
let usersCache = new Map();

async function getUser(id) {
  if (isNaN(id) || id >= 9223372036854775807) return { username: "Invalid ID" };
  if (usersCache.has(id)) {
    return usersCache.get(id);
  } else {
    return await fetchUser(id);
  }
}

async function fetchUser(id) {
  if (!client) return { username: "User Cacher isn't accessible!" };
  try {
    let user = await client.users.fetch(id);
    let resUser = {
      username: user.username,
      avatar: user.displayAvatarURL({ extension: "png", size: 128 }),
      discord_id: id
    };
    usersCache.set(id, resUser);
    return resUser;
  } catch (e) {
    if (e.message.includes("Expected token")) {
      return { username: "User Cacher isn't accessible!" };
    } else if (e.message === "Unknown User") {
      let resUser = { username: "Unknown User" };
      usersCache.set(id, resUser);
      return resUser;
    } else {
      console.log("⚠️ Fetch error:", e.message);
      return { username: "Couldn't fetch your discord user" };
    }
  }
}

module.exports = { getUser };
