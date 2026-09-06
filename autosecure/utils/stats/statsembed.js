const getembedautosec = require("../responses/getembedsautosec");
const { EmbedBuilder } = require("discord.js");

async function statsembed(client, acc, interaction) {
    const raw = await getembedautosec(client, "statsmsg", acc, interaction);

    let embed = raw;

    if (raw && Array.isArray(raw.fields) && raw.fields.length > 0) {
        console.log(`Embed worked!`);
    } else {
        embed = new EmbedBuilder()
            .setTitle("Stats Overview")
            .setDescription("None found")
            .setColor(11716576);
    }

    return { embeds: [embed] };
}

module.exports = statsembed;
