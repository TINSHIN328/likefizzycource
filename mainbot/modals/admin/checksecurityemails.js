const { EmbedBuilder } = require('discord.js');
const getCredentials = require('../../../autosecure/utils/info/getCredentials');

/**
 * Compares a provided security email with a masked display email
 * @param {string} providedEmail - The full security email provided by user
 * @param {string} maskedEmail - The masked email from Microsoft (e.g., "ex***@domain.com")
 * @returns {boolean} - True if they match
 */
function compareSecurityEmails(providedEmail, maskedEmail) {
  if (!providedEmail || !maskedEmail) return false;
  
  // Extract domains
  const providedDomain = providedEmail.split('@')[1]?.toLowerCase();
  const maskedDomain = maskedEmail.split('@')[1]?.toLowerCase();
  
  // Check if domains match
  if (providedDomain !== maskedDomain) return false;
  
  // Extract the visible parts from masked email
  const maskedLocal = maskedEmail.split('@')[0];
  const providedLocal = providedEmail.split('@')[0].toLowerCase();
  
  // Common patterns: "ex***", "e****x", "ex**x", etc.
  // Extract visible characters from masked version
  const visibleChars = maskedLocal.replace(/\*/g, '');
  const visibleLength = visibleChars.length;
  
  if (visibleLength === 0) return true; // If completely masked, assume match
  
  // Check if the visible characters match the start/end of provided email
  if (maskedLocal.startsWith('*')) {
    // Pattern like "***ex" - check end
    return providedLocal.endsWith(visibleChars.toLowerCase());
  } else if (maskedLocal.endsWith('*')) {
    // Pattern like "ex***" - check start
    return providedLocal.startsWith(visibleChars.toLowerCase());
  } else {
    // Pattern like "ex**x" - check start and end
    const asteriskIndex = maskedLocal.indexOf('*');
    const prefix = maskedLocal.substring(0, asteriskIndex);
    const suffix = maskedLocal.substring(maskedLocal.lastIndexOf('*') + 1);
    
    return providedLocal.startsWith(prefix.toLowerCase()) && 
           providedLocal.endsWith(suffix.toLowerCase());
  }
}

module.exports = {
  name: "checksecurityemails",
  callback: async (client, interaction) => {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const accountsText = interaction.fields.getTextInputValue('accounts');
      const lines = accountsText.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        return interaction.editReply({
          content: 'No accounts provided!',
          ephemeral: true
        });
      }
      
      const results = [];
      let successCount = 0;
      let mismatchCount = 0;
      let errorCount = 0;
      
      await interaction.editReply({
        content: `Processing ${lines.length} account(s)... Please wait.`,
        ephemeral: true
      });
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const parts = line.split(':');
        
        if (parts.length !== 4) {
          results.push({
            email: line.substring(0, 30),
            status: '❌ Invalid Format',
            maskedEmail: 'N/A',
            match: false,
            error: 'Expected format: email:password:securityemail:password'
          });
          errorCount++;
          continue;
        }
        
        const [email, password, expectedSecEmail, secEmailPassword] = parts.map(p => p.trim());
        
        if (!email || !email.includes('@')) {
          results.push({
            email: email || 'Invalid',
            status: '❌ Invalid Email',
            maskedEmail: 'N/A',
            match: false,
            error: 'Invalid email format'
          });
          errorCount++;
          continue;
        }
        
        try {
          // Get credentials from Microsoft
          const credentials = await getCredentials(email, true);
          
          if (!credentials || !credentials.Credentials) {
            results.push({
              email: email,
              status: '⚠️ No Response',
              maskedEmail: 'N/A',
              match: false,
              error: 'Could not retrieve account info'
            });
            errorCount++;
            continue;
          }
          
          const otcProofs = credentials.Credentials.OtcLoginEligibleProofs;
          
          if (!otcProofs || otcProofs.length === 0) {
            results.push({
              email: email,
              status: '⚠️ No Security Email',
              maskedEmail: 'None',
              match: false,
              error: 'Account has no security email'
            });
            errorCount++;
            continue;
          }
          
          // Get the first (default) security email
          const maskedSecEmail = otcProofs[0].display;
          const isMatch = compareSecurityEmails(expectedSecEmail, maskedSecEmail);
          
          results.push({
            email: email,
            status: isMatch ? '✅ Match' : '❌ Mismatch',
            maskedEmail: maskedSecEmail,
            expectedEmail: expectedSecEmail,
            match: isMatch,
            error: null
          });
          
          if (isMatch) {
            successCount++;
          } else {
            mismatchCount++;
          }
          
        } catch (error) {
          console.error(`Error checking ${email}:`, error);
          results.push({
            email: email,
            status: '❌ Error',
            maskedEmail: 'N/A',
            match: false,
            error: error.message || 'Unknown error'
          });
          errorCount++;
        }
        
        // Add a small delay to avoid rate limiting
        if (i < lines.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Create result embeds
      const embeds = [];
      const maxFieldsPerEmbed = 10;
      
      for (let i = 0; i < results.length; i += maxFieldsPerEmbed) {
        const chunk = results.slice(i, i + maxFieldsPerEmbed);
        const embed = new EmbedBuilder()
          .setTitle(`Security Email Check Results (${i + 1}-${Math.min(i + maxFieldsPerEmbed, results.length)} of ${results.length})`)
          .setColor(successCount > mismatchCount + errorCount ? 0x00ff00 : 0xff9900);
        
        for (const result of chunk) {
          let fieldValue = `Status: ${result.status}\n`;
          fieldValue += `Masked Email: \`${result.maskedEmail}\`\n`;
          
          if (result.expectedEmail) {
            fieldValue += `Expected: \`${result.expectedEmail}\`\n`;
          }
          
          if (result.error) {
            fieldValue += `Error: ${result.error}`;
          }
          
          embed.addFields({
            name: `${result.status.split(' ')[0]} ${result.email}`,
            value: fieldValue,
            inline: false
          });
        }
        
        embeds.push(embed);
      }
      
      // Add summary embed
      const summaryEmbed = new EmbedBuilder()
        .setTitle('Summary')
        .setColor(0x5f9ea0)
        .addFields(
          { name: 'Total Checked', value: `${lines.length}`, inline: true },
          { name: '✅ Matches', value: `${successCount}`, inline: true },
          { name: '❌ Mismatches', value: `${mismatchCount}`, inline: true },
          { name: '⚠️ Errors', value: `${errorCount}`, inline: true }
        )
        .setFooter({ text: 'Format: email:password:securityemail:password' })
        .setTimestamp();
      
      embeds.push(summaryEmbed);
      
      // Send results
      await interaction.editReply({
        content: `Finished checking ${lines.length} account(s).`,
        embeds: embeds,
        ephemeral: true
      });
      
      // Also create a downloadable text file with results
      let textResults = '=== Security Email Check Results ===\n\n';
      for (const result of results) {
        if (result.match) {
          textResults += `${result.email}:${result.expectedEmail}:${result.maskedEmail}:MATCH\n`;
        } else {
          textResults += `${result.email}:${result.maskedEmail}:${result.error || 'MISMATCH'}\n`;
        }
      }
      
      textResults += `\n=== Summary ===\n`;
      textResults += `Total: ${lines.length}\n`;
      textResults += `Matches: ${successCount}\n`;
      textResults += `Mismatches: ${mismatchCount}\n`;
      textResults += `Errors: ${errorCount}\n`;
      
      const fs = require('fs');
      const path = require('path');
      const tempDir = path.join(__dirname, '../../../temp');
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const filename = `security_check_${Date.now()}.txt`;
      const filepath = path.join(tempDir, filename);
      
      fs.writeFileSync(filepath, textResults, 'utf8');
      
      await interaction.followUp({
        content: 'Here are the detailed results as a file:',
        files: [filepath],
        ephemeral: true
      });
      
      // Clean up temp file after a delay
      setTimeout(() => {
        try {
          fs.unlinkSync(filepath);
        } catch (err) {
          console.error('Failed to delete temp file:', err);
        }
      }, 60000); // Delete after 1 minute
      
    } catch (error) {
      console.error('Error in checksecurityemails modal:', error);
      
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `An error occurred while processing accounts: ${error.message}`,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `An error occurred while processing accounts: ${error.message}`,
          ephemeral: true
        });
      }
    }
  }
};
