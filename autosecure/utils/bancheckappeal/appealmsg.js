const { EmbedBuilder } = require("discord.js")
const config = require("../../../config.json")
const profile = require("../minecraft/profile")
const secondvpsip = config.vpsip2;
const axios = require('axios');
const { queryParams } = require("../../../db/database.js");
const { codeblock } = require("../process/helpers.js");


let client;

async function appealmsg(userid, ssid) {
    let prof = await profile(ssid);
    if (!prof?.name) {
        return {
            embeds: [
                new EmbedBuilder()
                    .setTitle("Invalid Minecraft Account!")
            ],
            ephemeral: true
        };
    }

    const headers = {
        key: config.authkey,
        ssid: ssid,
        name: prof.name,
        user: userid
    };

    const url = `http://${config.vpsip2}:8080/createappeal`;

    let response = await axios.post(url, null, { headers: headers });
    const responseData = response?.data;

    if (response.status !== 200) {
        if (responseData?.error) {
            return {
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`Error: ${responseData.error}. This isn't your fault, please make a ticket or DM me ASAP.`)
                ],
                ephemeral: true
            };
        } else {
            return {
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`Unknown error, please report this!`)
                ],
                ephemeral: true
            };
        }
    } else {
        if (responseData?.queue === "alreadyin"){
            return {
                embeds: [
                new EmbedBuilder()
                    .setTitle(`Your account ${prof.name} is already in the appealer.`)
                    .setDescription(`Just wait till it's done lmao. Your position in queue is now: ${responseData?.queue2}`)
                    .setColor("#D4B7D9")
            ]   
            }
        }
        return {
            embeds: [
                new EmbedBuilder()
                    .setTitle(`Your account ${prof.name} has been added to the appealer.`)
                    .setDescription(`Position in queue: ${responseData?.queue ? responseData.queue : "N/A"}`)
                    .setColor("#D4B7D9")
            ]
        };
    }
}

async function finishedappealmsg(obj, uid) {
    console.log(`Finishing appeal with ID: ${obj.appealId} and UID: ${uid}`)
    
    try {
        const user = await client.users.fetch(obj.userid);
        if (!user) {
            console.error(`User ${obj.userid} not found`);
            return;
        }

        const appealData = obj.data ? (typeof obj.data === 'string' ? JSON.parse(obj.data) : obj.data) : null;
    

        


        const embed = new EmbedBuilder()
            .setTitle(`Your Hypixel Appeal ${obj.status === "worked" ? "Was Successful!" : "Result"}`)
            .setColor(obj.status === "worked" ? 0x00FF00 : 0xFFA500)
            .setDescription(`Here's the result of your appeal`)
            .addFields(
                { name: "🔹 Status", value: obj.status === "worked" ? "✅ Appealed" : "Failed", inline: true },
                { name: "🔹 Appeal ID", value: obj.appealId || "N/A", inline: true },
                { name: "🔹 Minecraft Name", value: appealData?.mcUsername || "N/A", inline: true },
                { name: "🔹 Forum Account", value: appealData?.username || "N/A", inline: true },
                { name: "🔹 Forum Email", value: appealData?.email ? `${appealData.email}` : "N/A", inline: true },
                { name: "🔹 Forum Password", value: appealData?.password ? `${appealData.password}` : "N/A", inline: true }
            );

        if (obj.threadurl) {
            embed.addFields(
                { name: "🔹 Appeal Thread", value: `[View your appeal](${obj.threadurl})` }
            );
        }

        await user.send({ embeds: [embed] });
        console.log(`Sent appeal result to user ${obj.userid}`);

        const deleteSql = "DELETE FROM finishedappeal WHERE id = ?";
        await queryParams(deleteSql, [uid], "run");
        console.log(`Deleted finished appeal with UID ${uid} from database`);
        
    } catch (error) {
        console.error('Error processing appeal message:', error);  
        console.log(
            `Appeal completed for user ${obj.userid}\n` +
            `Status: ${obj.status}\n` +
            `Appeal ID: ${obj.appealId}\n` +
            `UID: ${uid}`
        );
    }
}


function initializeappealclient(discordClient) {
    client = discordClient;
    console.log('Appealmsg initialized with Discord client');
}

module.exports = {
    appealmsg,
    finishedappealmsg,
    initializeappealclient
}