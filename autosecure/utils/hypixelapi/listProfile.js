const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js")
const short = require("short-number")
const getStats = require("./getStats")
module.exports = async (name, settings = { sensored: false, list: "skyblock", ping: "" }) => {
    let stats = await getStats(name)
   // console.log(stats)
    let embed = {
        title: `[${stats?.rank || "Non"}] ${settings.sensored ? `HIDDEN` : name}`,
        thumbnail: {
            url: `https://visage.surgeplay.com/bust/${name}.png?y=-40&quality=lossless`
          },
        "color": 2829617,
    };
    let sensored = settings?.sensored ? "1" : "0"
    if (settings.list == "skyblock") {
        let profile = {}
        let components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`skyblock|${name}|${sensored}`).setLabel("Skyblock").setStyle(ButtonStyle.Primary).setEmoji({ name: "🏝️" }).setDisabled(true),
                new ButtonBuilder().setCustomId(`bedwars|${name}|${sensored}`).setLabel("Bedwars").setStyle(ButtonStyle.Primary).setEmoji({ name: "🛏️" }),
                new ButtonBuilder().setCustomId(`skywars|${name}|${sensored}`).setLabel("Skywars").setStyle(ButtonStyle.Primary).setEmoji({ name: "☁️" }),
                new ButtonBuilder().setCustomId(`duels|${name}|${sensored}`).setLabel("Duels").setStyle(ButtonStyle.Primary).setEmoji({ name: "⚔️" }),
            ),
        ]
        let profilesMenu = new StringSelectMenuBuilder().setCustomId("profiles|" + sensored).setPlaceholder("Profile")
        if (Array.isArray(stats?.skyblock) && stats.skyblock.length != 0) {

const sortedProfiles = [...stats.skyblock].sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0));

for (let p of sortedProfiles) {
    profilesMenu.addOptions({
        label: p.current ? `${p.name} (Selected)` : p.name,
        value: `skyblock|${name}|${p.name}|${sensored}`,
    })
}
components.push(
    new ActionRowBuilder().addComponents(
        profilesMenu
    )
)

            if (!settings.profile) {
                profile = stats?.skyblock?.find(prof => prof.current === true);
            } else {
                for (let prof of stats.skyblock) {
                    if (prof.name == settings.profile) {
                        profile = prof
                    }
                }
            }
        }
        if (!profile) profile = stats.skyblock[0]

                        const slayers = [
                profile?.slayers?.zombie || 0,
                profile?.slayers?.wolf || 0,
                profile?.slayers?.spider || 0,
                profile?.slayers?.enderman || 0,
                profile?.slayers?.blaze || 0,
                profile?.slayers?.vampire || 0
            ].join(" | ");




        embed.fields = [
            {
                "name": `:island: Skill AVG`,
                "value": profile?.skills?.avg || 0,
                "inline": true
            },
            {
                "name": "\u200b",
                "value": "\u200b",
                "inline": true
            },
            {
                "name": `:european_castle: Catacombs`,
                "value": `${profile?.catacombs?.level || 0}`,
                "inline": true
            },
            {
                "name": `:crossed_swords: Slayers\u0020\u0020\u0020`,
                "value": slayers,
                "inline": true
            },

            {
                "name": "\u200b",
                "value": "\u200b",
                "inline": true
            },
            {
                "name": `:level_slider: Level`,
                "value": profile?.levels || 0,
                "inline": true
            },
            {
                "name": `:bank: Networth`,
                "value": `${short(profile?.networth || 0) || 0} (${short(profile?.liquid || 0) || 0} Coins)\n${short(profile?.unsoulboundNetworth || 0) || 0} Unsoulbound Networth`,
                "inline": false
            },
            {
                "name": `:pick: Mining`,
                "value": `Heart of the Mountain: ${profile?.mining?.hotm || 0}\nMithril Powder: ${short(profile?.mining?.mithrilPowder || 0) || 0}\nGemstone Powder: ${short(profile?.mining?.gemstonePowder || 0) || 0}`,
                "inline": false
            },
        ]
        let msg = {
            embeds: [embed],
            components: components,
            ephemeral: true
        }
        if (settings.ping) {
            msg.content = settings.ping
        }
        return msg
    } else if (settings.list == "bedwars") {
        let bedwars = stats?.bedwars;
        embed.fields = [
  {
        name: "Level",
        value: `${bedwars.level}`,
        inline: true,
      },
      {
        name: "Coins",
        value: `${short(bedwars.coins)}`,
        inline: true,
      },
      {
        name: "Kills",
        value: `${bedwars.kills}`,
        inline: true,
      },
      {
        name: "Final Kills",
        value: `${bedwars.finalKills}`,
        inline: true,
      },

      {
        name: "Deaths",
        value: `${bedwars.finalDeaths}`,
        inline: true,
      },

      {
        name: "FKDR",
        value: `${bedwars.fkdr}`,
        inline: true,
      },
      {
        name: "Wins",
        value: `${bedwars.wins}`,
        inline: true,
      },

      {
        name: "Losses",
        value: `${bedwars.losses}`,
        inline: true,
      },

      {
        name: "Win Rate",
        value: `${bedwars.wlr}`,
        inline: true,
      },
      {
        name: "Beds Broken",
        value: `${bedwars.bedsBroken}`,
        inline: true,
      },

      {
        name: "Beds Lost",
        value: `${bedwars.bedsLost}`,
        inline: true,
      },

      {
        name: "BBLR",
        value: `${bedwars.bblr}`,
        inline: true,
      },
        ];

        let components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`skyblock|${name}|${sensored}`).setLabel("Skyblock").setStyle(ButtonStyle.Primary).setEmoji({ name: "🏝️" }),
                new ButtonBuilder().setCustomId(`bedwars|${name}|${sensored}`).setLabel("Bedwars").setStyle(ButtonStyle.Primary).setEmoji({ name: "🛏️" }).setDisabled(true),
                new ButtonBuilder().setCustomId(`skywars|${name}|${sensored}`).setLabel("Skywars").setStyle(ButtonStyle.Primary).setEmoji({ name: "☁️" }),
                new ButtonBuilder().setCustomId(`duels|${name}|${sensored}`).setLabel("Duels").setStyle(ButtonStyle.Primary).setEmoji({ name: "⚔️" }),
            ),
        ]
        return {
            embeds: [embed],
            components: components,
            ephemeral: true
        }
    } else if (settings.list == "skywars") {

        let skywars = stats?.skywars;
        embed.fields = [
            {
                name: "Levels",
                value: `${skywars?.levels || 0}`,
                inline: true,
            },
            {
                name: "Coins",
                value: `${short(skywars?.coins || 0)}`,
                inline: true,
            },
            {
                name: "Assists",
                value: `${skywars?.assists || 0}`,
                inline: true,
            },
            {
                name: "Kills",
                value: `${skywars?.kills || 0}`,
                inline: true,
            },

            {
                name: "Deaths",
                value: `${skywars?.deaths || 0}`,
                inline: true,
            },

            {
                name: "KDR",
                value: `${skywars?.kdr || 0}`,
                inline: true,
            },
            {
                name: "Wins",
                value: `${skywars?.wins || 0}`,
                inline: true,
            },

            {
                name: "Losses",
                value: `${skywars?.losses || 0}`,
                inline: true,
            },

            {
                name: "Win Rate",
                value: `${skywars?.wlr || 0}`,
                inline: true,
            }
        ];
        let components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`skyblock|${name}|${sensored}`).setLabel("Skyblock").setStyle(ButtonStyle.Primary).setEmoji({ name: "🏝️" }),
                new ButtonBuilder().setCustomId(`bedwars|${name}|${sensored}`).setLabel("Bedwars").setStyle(ButtonStyle.Primary).setEmoji({ name: "🛏️" }),
                new ButtonBuilder().setCustomId(`skywars|${name}|${sensored}`).setLabel("Skywars").setStyle(ButtonStyle.Primary).setEmoji({ name: "☁️" }).setDisabled(true),
                new ButtonBuilder().setCustomId(`duels|${name}|${sensored}`).setLabel("Duels").setStyle(ButtonStyle.Primary).setEmoji({ name: "⚔️" }),
            ),
        ]
        return {
            embeds: [embed],
            components: components,
            ephemeral: true
        }
    } else if (settings.list == "duels") {
        let duels = stats?.duels;
        let coins = duels?.coins || 0;
        embed.fields = [
            {
                name: "Title",
                value: `${duels?.title || "None"}`,
                inline: true,
            },
            {
                name: "Games Played",
                value: `${duels?.totalGamesPlayed || 0}`,
                inline: true,
            },
            {
                name: "Coins",
                value: `${short(coins)}`,
                inline: true,
            },
            {
                name: "Kills",
                value: `${duels?.kills || 0}`,
                inline: true,
            },

            {
                name: "Deaths",
                value: `${duels?.deaths || 0}`,
                inline: true,
            },

            {
                name: "KLR",
                value: `${duels?.KLRatio || 0}`,
                inline: true,
            },
            {
                name: "Wins",
                value: `${duels?.wins || 0}`,
                inline: true,
            },

            {
                name: "Losses",
                value: `${duels?.losses || 0}`,
                inline: true,
            },

            {
                name: "Win Rate",
                value: `${duels?.WLRatio || 0}`,
                inline: true,
            },
        ];

        let components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`skyblock|${name}|${sensored}`).setLabel("Skyblock").setStyle(ButtonStyle.Primary).setEmoji({ name: "🏝️" }),
                new ButtonBuilder().setCustomId(`bedwars|${name}|${sensored}`).setLabel("Bedwars").setStyle(ButtonStyle.Primary).setEmoji({ name: "🛏️" }),
                new ButtonBuilder().setCustomId(`skywars|${name}|${sensored}`).setLabel("Skywars").setStyle(ButtonStyle.Primary).setEmoji({ name: "☁️" }),
                new ButtonBuilder().setCustomId(`duels|${name}|${sensored}`).setLabel("Duels").setStyle(ButtonStyle.Primary).setEmoji({ name: "⚔️" }).setDisabled(true),
            ),
        ]
        return {
            embeds: [embed],
            components: components,
            ephemeral: true
        }
    }
}