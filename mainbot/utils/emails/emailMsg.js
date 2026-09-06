const { ButtonBuilder, ActionRowBuilder } = require("@discordjs/builders");
const { queryParams } = require("../../../db/database");
const { ButtonStyle, EmbedBuilder } = require("discord.js");
const { footer } = require('../../../config.json');
const config = require('../../../config.json');

module.exports = async (email, id, current) => {
    let owndomain;
    let embed = {
        title: email,
        color: 0x808080
    };

    let buttons = [];
    let msg = {
        ephemeral: true
    };

    if (!email.includes("@")) {
        return {
            embeds: [
                new EmbedBuilder()
                    .setTitle("Invalid email!")
                    .setColor(0xADD8E6)
            ],
            ephemeral: true
        };
    }

    const emaildomain = email.split('@')[1];

    function isconfigdomain(domain) {
        return config.domains.includes(domain);
    }

    if (email.includes("@") && !isconfigdomain(emaildomain)) {
        owndomain = true;
    }

    let emails = await queryParams(
        `SELECT * FROM emails WHERE receiver=? ORDER BY time DESC`,
        [email]
    );

    current = Number(current);

    let isNotified = await queryParams(
        `SELECT * FROM email_notifier WHERE user_id=? AND email=?`,
        [id, email]
    );

    let notificationButton;
    if (isNotified.length == 0) {
        notificationButton = new ButtonBuilder()
            .setCustomId("notifier|" + email + "|" + current)
            .setLabel("Enable Notifications & Save")
            .setEmoji({ name: "🔔" })
            .setStyle(ButtonStyle.Success);
    } else {
        notificationButton = new ButtonBuilder()
            .setCustomId("notifier|" + email + "|" + current)
            .setLabel("Disable Notifications & Remove")
            .setEmoji({ name: "🔔" })
            .setStyle(ButtonStyle.Danger);
    }

    if (emails.length === 0) {
        if (owndomain) {
            embed.description = `No emails yet. You seem to be using a different (own) domain. Verify the domain setup is correct using the button if you're not getting emails.`;

            let setupButton = new ButtonBuilder()
                .setCustomId(`setupdomain|${emaildomain}`)
                .setLabel("Setup mail forwarding")
                .setStyle(ButtonStyle.Success);

            let refreshButton = new ButtonBuilder()
                .setCustomId("refresh|" + email + "|" + current)
                .setLabel("Refresh")
                .setEmoji({ name: "🔄" })
                .setStyle(ButtonStyle.Primary);

            buttons.push(new ActionRowBuilder().addComponents(refreshButton, setupButton));
        } else {
            embed.description = `This address hasn't received any emails yet.`;

            let refreshButton = new ButtonBuilder()
                .setCustomId("refresh|" + email + "|" + current)
                .setLabel("Refresh")
                .setEmoji({ name: "🔄" })
                .setStyle(ButtonStyle.Primary);

            buttons.push(new ActionRowBuilder().addComponents(refreshButton));
        }

        buttons.push(new ActionRowBuilder().addComponents(notificationButton));
    } else {
        current = Math.max(1, Math.min(current, emails.length));

        msg.content = `${email}`;
        embed.title = emails[current - 1]?.subject
            ? emails[current - 1].subject.replaceAll("*", "\\*")
            : `No Subject!`;

        let description = emails[current - 1]?.description
            ? emails[current - 1].description.replaceAll("*", "\\*")
            : `No description!`;

        if (description.length > 4096) {
            console.log(description);
            description = description.substring(0, 4093) + "...";
        }

        embed.description = description;
        const d = new Date(parseInt(emails[current - 1].time));
        embed.timestamp = d.toISOString();
        embed.footer = footer;

        let next = (current + 1).toString();
        let back = (current - 1).toString();
        let fastforward = emails.length.toString();

        buttons.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`move|${email}|1|fastbackward`)
                    .setEmoji({ name: "⏪" })
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(current === 1),
                new ButtonBuilder()
                    .setCustomId(`move|${email}|${back}|backward`)
                    .setEmoji({ name: "◀️" })
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(current === 1),
                new ButtonBuilder()
                    .setCustomId(`current|${email}`)
                    .setLabel(`${current}/${emails.length}`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`move|${email}|${next}|forward`)
                    .setEmoji({ name: "➡️" })
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(current === emails.length),
                new ButtonBuilder()
                    .setCustomId(`move|${email}|${fastforward}|fastforward`)
                    .setEmoji({ name: "⏩" })
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(current === emails.length)
            )
        );

        let refreshButton = new ButtonBuilder()
            .setCustomId("refresh|" + email + "|" + current)
            .setLabel("Refresh")
            .setEmoji({ name: "🔄" })
            .setStyle(ButtonStyle.Primary);

        buttons.push(new ActionRowBuilder().addComponents(notificationButton, refreshButton));
    }

    msg.embeds = [embed];
    msg.components = buttons;

    return msg;
};
