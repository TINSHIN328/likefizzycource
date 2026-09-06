/**
 * Check All Domains in Database
 * Shows what domains are actually being used
 */

const { queryParams } = require('./database');
const config = require('../config.json');

async function checkAllDomains() {
    console.log(`\n🔍 Analyzing all domains in database...`);
    console.log(`   Current config domain: ${config.domains[0]}\n`);

    try {
        // Get unique domains from secureconfig
        console.log('📋 secureconfig table:');
        const secureConfigDomains = await queryParams(
            'SELECT DISTINCT domain, COUNT(*) as count FROM secureconfig GROUP BY domain'
        );
        if (secureConfigDomains.length > 0) {
            secureConfigDomains.forEach(row => {
                const marker = row.domain === config.domains[0] ? '✅' : '⚠️';
                console.log(`   ${marker} ${row.domain}: ${row.count} users`);
            });
        } else {
            console.log('   No records found');
        }

        // Get unique domains from autosecure
        console.log('\n📋 autosecure table:');
        const autosecureDomains = await queryParams(
            'SELECT DISTINCT domain, COUNT(*) as count FROM autosecure GROUP BY domain'
        );
        if (autosecureDomains.length > 0) {
            autosecureDomains.forEach(row => {
                const marker = row.domain === config.domains[0] ? '✅' : '⚠️';
                console.log(`   ${marker} ${row.domain}: ${row.count} bots`);
            });
        } else {
            console.log('   No records found');
        }

        // Get unique email domains from registeredemails
        console.log('\n📋 registeredemails table:');
        const registeredEmails = await queryParams(
            'SELECT email FROM registeredemails'
        );
        if (registeredEmails.length > 0) {
            const domainCounts = {};
            registeredEmails.forEach(row => {
                const domain = row.email.split('@')[1];
                domainCounts[domain] = (domainCounts[domain] || 0) + 1;
            });
            Object.entries(domainCounts).forEach(([domain, count]) => {
                const marker = domain === config.domains[0] ? '✅' : '⚠️';
                console.log(`   ${marker} ${domain}: ${count} emails`);
            });
        } else {
            console.log('   No records found');
        }

        // Get unique email domains from email_notifier
        console.log('\n📋 email_notifier table:');
        const notifierEmails = await queryParams(
            'SELECT email FROM email_notifier'
        );
        if (notifierEmails.length > 0) {
            const domainCounts = {};
            notifierEmails.forEach(row => {
                const domain = row.email.split('@')[1];
                domainCounts[domain] = (domainCounts[domain] || 0) + 1;
            });
            Object.entries(domainCounts).forEach(([domain, count]) => {
                const marker = domain === config.domains[0] ? '✅' : '⚠️';
                console.log(`   ${marker} ${domain}: ${count} emails`);
            });
        } else {
            console.log('   No records found');
        }

        // Get unique email domains from accounts (secemail)
        console.log('\n📋 accounts table (secemail):');
        const accounts = await queryParams(
            'SELECT secemail FROM accounts WHERE secemail IS NOT NULL AND secemail != ""'
        );
        if (accounts.length > 0) {
            const domainCounts = {};
            accounts.forEach(row => {
                const domain = row.secemail.split('@')[1];
                if (domain) {
                    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
                }
            });
            Object.entries(domainCounts).forEach(([domain, count]) => {
                const marker = domain === config.domains[0] ? '✅' : '⚠️';
                console.log(`   ${marker} ${domain}: ${count} accounts`);
            });
        } else {
            console.log('   No records found');
        }

        // Check total records
        console.log('\n📊 Total Records:');
        const totalSecureConfig = await queryParams('SELECT COUNT(*) as count FROM secureconfig');
        const totalAutosecure = await queryParams('SELECT COUNT(*) as count FROM autosecure');
        const totalRegistered = await queryParams('SELECT COUNT(*) as count FROM registeredemails');
        const totalNotifier = await queryParams('SELECT COUNT(*) as count FROM email_notifier');
        const totalAccounts = await queryParams('SELECT COUNT(*) as count FROM accounts');
        
        console.log(`   secureconfig: ${totalSecureConfig[0].count}`);
        console.log(`   autosecure: ${totalAutosecure[0].count}`);
        console.log(`   registeredemails: ${totalRegistered[0].count}`);
        console.log(`   email_notifier: ${totalNotifier[0].count}`);
        console.log(`   accounts: ${totalAccounts[0].count}`);

        console.log('\n✅ Analysis complete!\n');

    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

// Run if executed directly
if (require.main === module) {
    checkAllDomains()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('❌ Failed:', error);
            process.exit(1);
        });
}

module.exports = { checkAllDomains };
