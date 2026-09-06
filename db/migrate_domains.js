/**
 * Domain Migration Script
 * Migrates all old domains (mail.mooissha) to the new domain from config
 */

const { queryParams } = require('./database');
const config = require('../config.json');

const OLD_DOMAIN = 'mail.mooissha.dev';
const NEW_DOMAIN = config.domains[0]; // Current domain from config

async function migrateDomains() {
    console.log(`\n🔄 Starting domain migration...`);
    console.log(`   Old domain: ${OLD_DOMAIN}`);
    console.log(`   New domain: ${NEW_DOMAIN}\n`);

    try {
        // Migrate secureconfig table
        console.log('📋 Migrating secureconfig table...');
        const secureConfigResult = await queryParams(
            'UPDATE secureconfig SET domain = ? WHERE domain = ?',
            [NEW_DOMAIN, OLD_DOMAIN]
        );
        console.log(`   ✅ Updated ${secureConfigResult.changes || 0} records in secureconfig`);

        // Migrate autosecure table
        console.log('📋 Migrating autosecure table...');
        const autosecureResult = await queryParams(
            'UPDATE autosecure SET domain = ? WHERE domain = ?',
            [NEW_DOMAIN, OLD_DOMAIN]
        );
        console.log(`   ✅ Updated ${autosecureResult.changes || 0} records in autosecure`);

        // Check and report registeredemails that need attention
        console.log('📋 Checking registeredemails table...');
        const registeredEmails = await queryParams(
            'SELECT user_id, email FROM registeredemails WHERE email LIKE ?',
            [`%@${OLD_DOMAIN}`]
        );
        
        if (registeredEmails.length > 0) {
            console.log(`   ⚠️  Found ${registeredEmails.length} registered emails with old domain:`);
            console.log(`   Note: These are actual email addresses and should be reviewed manually.`);
            
            // Optional: Update them automatically (uncomment if needed)
            // for (const row of registeredEmails) {
            //     const oldEmail = row.email;
            //     const newEmail = oldEmail.replace(`@${OLD_DOMAIN}`, `@${NEW_DOMAIN}`);
            //     await queryParams(
            //         'UPDATE registeredemails SET email = ? WHERE email = ?',
            //         [newEmail, oldEmail]
            //     );
            //     console.log(`      ${oldEmail} -> ${newEmail}`);
            // }
        } else {
            console.log(`   ✅ No registered emails with old domain found`);
        }

        // Check email_notifier table
        console.log('📋 Checking email_notifier table...');
        const notifierEmails = await queryParams(
            'SELECT user_id, email FROM email_notifier WHERE email LIKE ?',
            [`%@${OLD_DOMAIN}`]
        );
        
        if (notifierEmails.length > 0) {
            console.log(`   ⚠️  Found ${notifierEmails.length} notifier emails with old domain`);
            
            // Optional: Update them automatically (uncomment if needed)
            // for (const row of notifierEmails) {
            //     const oldEmail = row.email;
            //     const newEmail = oldEmail.replace(`@${OLD_DOMAIN}`, `@${NEW_DOMAIN}`);
            //     await queryParams(
            //         'UPDATE email_notifier SET email = ? WHERE email = ?',
            //         [newEmail, oldEmail]
            //     );
            //     console.log(`      ${oldEmail} -> ${newEmail}`);
            // }
        } else {
            console.log(`   ✅ No notifier emails with old domain found`);
        }

        console.log(`\n✅ Domain migration completed successfully!\n`);
        
        // Summary report
        console.log('📊 Summary:');
        console.log(`   - secureconfig: ${secureConfigResult.changes || 0} records updated`);
        console.log(`   - autosecure: ${autosecureResult.changes || 0} records updated`);
        console.log(`   - registeredemails: ${registeredEmails.length} emails with old domain (review manually)`);
        console.log(`   - email_notifier: ${notifierEmails.length} emails with old domain (review manually)`);
        
    } catch (error) {
        console.error('❌ Error during migration:', error);
        throw error;
    }
}

// Run if executed directly
if (require.main === module) {
    migrateDomains()
        .then(() => {
            console.log('\n✅ Migration script finished');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateDomains };
