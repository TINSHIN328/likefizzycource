/**
 * Domain Check Script
 * Shows which records still use the old domain without making changes
 */

const { queryParams } = require('./database');
const config = require('../config.json');

const OLD_DOMAINS = ['mail.mooissha', 'mooissha.dev']; // Add all old domains here
const CURRENT_DOMAIN = config.domains[0];

async function checkDomains() {
    console.log(`\n🔍 Checking for old domains...`);
    console.log(`   Old domains: ${OLD_DOMAINS.join(', ')}`);
    console.log(`   Current domain: ${CURRENT_DOMAIN}\n`);

    let totalIssues = 0;

    for (const oldDomain of OLD_DOMAINS) {
        console.log(`\n📌 Checking domain: ${oldDomain}`);
        console.log('─'.repeat(60));

        // Check secureconfig
        const secureConfig = await queryParams(
            'SELECT user_id, domain FROM secureconfig WHERE domain = ?',
            [oldDomain]
        );
        if (secureConfig.length > 0) {
            console.log(`\n📋 secureconfig table: ${secureConfig.length} records`);
            secureConfig.slice(0, 5).forEach(row => {
                console.log(`   User ID: ${row.user_id} -> Domain: ${row.domain}`);
            });
            if (secureConfig.length > 5) {
                console.log(`   ... and ${secureConfig.length - 5} more`);
            }
            totalIssues += secureConfig.length;
        }

        // Check autosecure
        const autosecure = await queryParams(
            'SELECT user_id, botnumber, domain FROM autosecure WHERE domain = ?',
            [oldDomain]
        );
        if (autosecure.length > 0) {
            console.log(`\n📋 autosecure table: ${autosecure.length} records`);
            autosecure.slice(0, 5).forEach(row => {
                console.log(`   User ID: ${row.user_id}, Bot #${row.botnumber} -> Domain: ${row.domain}`);
            });
            if (autosecure.length > 5) {
                console.log(`   ... and ${autosecure.length - 5} more`);
            }
            totalIssues += autosecure.length;
        }

        // Check registeredemails
        const registeredEmails = await queryParams(
            'SELECT user_id, email FROM registeredemails WHERE email LIKE ?',
            [`%@${oldDomain}`]
        );
        if (registeredEmails.length > 0) {
            console.log(`\n📋 registeredemails table: ${registeredEmails.length} records`);
            registeredEmails.slice(0, 5).forEach(row => {
                console.log(`   User ID: ${row.user_id} -> Email: ${row.email}`);
            });
            if (registeredEmails.length > 5) {
                console.log(`   ... and ${registeredEmails.length - 5} more`);
            }
            totalIssues += registeredEmails.length;
        }

        // Check email_notifier
        const emailNotifier = await queryParams(
            'SELECT user_id, email FROM email_notifier WHERE email LIKE ?',
            [`%@${oldDomain}`]
        );
        if (emailNotifier.length > 0) {
            console.log(`\n📋 email_notifier table: ${emailNotifier.length} records`);
            emailNotifier.slice(0, 5).forEach(row => {
                console.log(`   User ID: ${row.user_id} -> Email: ${row.email}`);
            });
            if (emailNotifier.length > 5) {
                console.log(`   ... and ${emailNotifier.length - 5} more`);
            }
            totalIssues += emailNotifier.length;
        }

        // Check accounts table (secured accounts with old domain in secemail)
        const accounts = await queryParams(
            'SELECT uid, username, secemail FROM accounts WHERE secemail LIKE ?',
            [`%@${oldDomain}`]
        );
        if (accounts.length > 0) {
            console.log(`\n📋 accounts table: ${accounts.length} secured accounts`);
            accounts.slice(0, 5).forEach(row => {
                console.log(`   Username: ${row.username} -> SecEmail: ${row.secemail}`);
            });
            if (accounts.length > 5) {
                console.log(`   ... and ${accounts.length - 5} more`);
            }
            totalIssues += accounts.length;
        }
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total records with old domains: ${totalIssues}`);
    
    if (totalIssues > 0) {
        console.log(`\n⚠️  ACTION NEEDED:`);
        console.log(`   Run the migration script to update these domains:`);
        console.log(`   node db/migrate_domains.js`);
    } else {
        console.log(`\n✅ All records are using the current domain!`);
    }
    
    console.log('');
}

// Run if executed directly
if (require.main === module) {
    checkDomains()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Error:', error);
            process.exit(1);
        });
}

module.exports = { checkDomains };
