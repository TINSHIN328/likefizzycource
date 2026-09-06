/**
 * Script to update email_notifier table from old domain to new domain
 */

const { queryParams } = require('./database');
const config = require('../config.json');

const OLD_DOMAIN = 'mail.mooissha.dev';
const NEW_DOMAIN = config.domains[0]; // Current domain from config

async function updateEmailNotifier() {
    console.log(`\n🔄 Updating email_notifier table...`);
    try {
        // Select all emails with old domain
        const notifierEmails = await queryParams(
            'SELECT user_id, email FROM email_notifier WHERE email LIKE ?',
            [`%@${OLD_DOMAIN}`]
        );
        if (notifierEmails.length === 0) {
            console.log('✅ No emails with old domain found.');
            return;
        }
        for (const row of notifierEmails) {
            const oldEmail = row.email;
            const newEmail = oldEmail.replace(`@${OLD_DOMAIN}`, `@${NEW_DOMAIN}`);
            await queryParams(
                'UPDATE email_notifier SET email = ? WHERE email = ?',
                [newEmail, oldEmail]
            );
            console.log(`   ${oldEmail} -> ${newEmail}`);
        }
        console.log(`\n✅ Updated ${notifierEmails.length} emails in email_notifier table.`);
    } catch (error) {
        console.error('❌ Error updating email_notifier:', error);
    }
}

if (require.main === module) {
    updateEmailNotifier()
        .then(() => {
            console.log('\n✅ Update script finished');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Update script failed:', error);
            process.exit(1);
        });
}

module.exports = { updateEmailNotifier };
