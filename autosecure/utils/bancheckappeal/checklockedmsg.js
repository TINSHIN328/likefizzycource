const { EmbedBuilder } = require("discord.js");
const validEmail = require("../emails/validEmail");
const checklocked = require("../secure/checklocked");
const { codeblock } = require("../process/helpers");

module.exports = async function checklockedmsg(email) {
  if (!validEmail(email)) {
    return {
      embeds: [new EmbedBuilder().setTitle(`Invalid email: ${email}`).setColor(0xc8a2c8)],
      ephemeral: true,
    };
  }

  let islockedobj = await checklocked(email);

  if (islockedobj.locked === "error") {
    let errortext = codeblock(islockedobj.reason || "Unknown error");
    const errorEmbed = new EmbedBuilder()
      .setTitle("Account Status")
      .setDescription("Error occurred while checking, please report this if the error below is false.")
      .addFields([
        {
          name: "Error",
          value: errortext
        }
      ])
      .setColor(0xff0000);
    return { embeds: [errorEmbed], ephemeral: true };
  }

  let reason = null;
  let permanent = "Unknown";

  if (islockedobj.reason) {
    if (islockedobj.reason.toLowerCase() === "override") {
      reason = "Phone locked (likely)";
      permanent = "Maybe";
    } else {
      reason = islockedobj.reason;
      permanent = "No";
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(`Account Status | ${islockedobj.locked ? "❌ Locked" : "✅ Unlocked"}`)
    .setColor(0xc8a2c8)
    .addFields(
      { name: "Email", value: email, inline: false },
      { name: "Locked", value: String(islockedobj.locked), inline: true },
      { name: "Compromised", value: String(islockedobj.compromised), inline: true },
      { name: "Blocked", value: String(islockedobj.blocked), inline: true },
      { name: "2FA Enabled", value: String(islockedobj.tsvEnabled), inline: true },
      { name: "Active", value: String(islockedobj.active), inline: true },
      { name: "Email Verified", value: String(islockedobj.emailVerified), inline: true },
      { name: "Reason", value: reason || "None", inline: true }
    )
.setFooter({
  text: "Don't spam this command for the same email. It may show unlocked falsely in this case."
})


  if (islockedobj.locked) {
    embed.addFields({ name: "Unlockable (Excluding support)", value: permanent, inline: true });
  }

  return { embeds: [embed], ephemeral: true };
};
