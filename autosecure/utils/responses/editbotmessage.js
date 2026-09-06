const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { queryParams } = require('../../../db/database');
const { codeblock } = require('../../../autosecure/utils/process/helpers');
const { autosecureMap } = require('../../../mainbot/handlers/botHandler');
const generate = require('../utils/generate');

async function editbotmsg(client, interaction, botnumber, ownerid) {

    let hidebutton = false
    if (client.isuserbot) hidebutton = true
   
    let c = await autosecureMap.get(`${ownerid}|${botnumber}`);

    try {
        const botData = await queryParams(
            "SELECT activity FROM autosecure WHERE user_id = ? AND botnumber = ? LIMIT 1",
            [ownerid, botnumber],
            "get"
        );

        let activityData = {};
        if (botData && botData.activity) {
            try {
                activityData = JSON.parse(botData.activity);
            } catch {
                const embed = new EmbedBuilder()
                    .setDescription("Invalid activity data format.")
                    .setColor(0xFF0000);

                return {
                    embeds: [embed],
                    components: [],
                    ephemeral: true
                };
            }
        }

        const typeText = activityData.type || 'None';
        const messageText = activityData.text || 'None';
        const visibility = activityData.visibility || 'online';

        const activityBlock = codeblock(`${typeText} ${messageText}`.trim());
        const visibilityBlock = codeblock(visibility);


const readyTimestampMs = c?.readyTimestamp || 0;
let sessionText;

if (!readyTimestampMs) {
    sessionText = "**Session: not started yet**";
} else {
    const readyTimestampSec = Math.floor(readyTimestampMs / 1000);
    sessionText = `**Session started** \n <t:${readyTimestampSec}:R>`;
}

const embed = new EmbedBuilder()
    .setDescription(sessionText)
    .setColor(0xADD8E6)
    .addFields(
        { name: "Status", value: activityBlock, inline: true },
        { name: "Visibility", value: visibilityBlock, inline: true }
    );


        const result = await queryParams(
            'SELECT * FROM autosecure WHERE user_id = ? AND botnumber = ?',
            [ownerid, botnumber]
        );

        let generatedid = generate(32);
        const save = `restart|${ownerid}|${botnumber}|${result[0].token}|${c ? 'offline' : 'online'}`;
        await queryParams(`INSERT INTO actions (id, action) VALUES (?, ?)`, [generatedid, save]);

        const key = `${ownerid}|${botnumber}`;

const button1 = new ButtonBuilder()
    .setLabel('Set Activity')
    .setStyle(ButtonStyle.Success)
    .setCustomId(`setactivity|${ownerid}|${botnumber}`);

const button2 = new ButtonBuilder()
    .setLabel('Change Token')
    .setStyle(ButtonStyle.Success)
    .setCustomId(`changetoken|${ownerid}|${botnumber}`);

const button3 = new ButtonBuilder()
    .setLabel('Restart')
    .setStyle(ButtonStyle.Success)
    .setCustomId(`action|${generatedid}`);

const row = new ActionRowBuilder().addComponents(button1, button2, button3);

let row2 = null;
if (!hidebutton) {
    row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Register Commands')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`registercommands|${key}`),
                    new ButtonBuilder()
            .setLabel('Delete')
            .setStyle(ButtonStyle.Danger)
            .setCustomId(`deletebot|${ownerid}|${botnumber}`),
        new ButtonBuilder()
        .setLabel("Copy Token")
        .setStyle(ButtonStyle.Secondary)
        .setCustomId(`copytokenbot|${ownerid}|${botnumber}`)

    );
}

const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setLabel('Register Commands')
        .setStyle(ButtonStyle.Primary)
        .setCustomId(`registercommands|${key}`),
    new ButtonBuilder()
        .setLabel('Set Activity')
        .setStyle(ButtonStyle.Success)
        .setCustomId(`setactivity|${ownerid}|${botnumber}`)
);

const components = row2 ? [row, row2] : [row3];

return {
    embeds: [embed],
    components: components,
    ephemeral: true
};

    } catch (error) {
        console.error("Error in editbotmsg function:", error);

        const embed = new EmbedBuilder()
            .setDescription("An error occurred while processing your request.")
            .setColor(0xFF0000);

        return {
            embeds: [embed],
            components: [],
            ephemeral: true
        };
    }
}

module.exports = { editbotmsg };