/**
 * Check Database Schema
 * Shows the actual DEFAULT values in database tables
 */

const { queryParams } = require('./database');
const config = require('../config.json');

async function checkSchema() {
    console.log(`\n🔍 Checking database schema...`);
    console.log(`   Current config domain: ${config.domains[0]}\n`);

    try {
        // Get schema for secureconfig
        console.log('📋 secureconfig table schema:');
        const secureConfigSchema = await queryParams(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='secureconfig'"
        );
        if (secureConfigSchema.length > 0) {
            console.log(secureConfigSchema[0].sql);
            const domainMatch = secureConfigSchema[0].sql.match(/domain TEXT DEFAULT '([^']*)'/);
            if (domainMatch) {
                const defaultDomain = domainMatch[1];
                if (defaultDomain !== config.domains[0]) {
                    console.log(`\n⚠️  DEFAULT domain in DB: ${defaultDomain}`);
                    console.log(`   Config domain: ${config.domains[0]}`);
                    console.log(`   ❌ MISMATCH! This is the problem!`);
                } else {
                    console.log(`\n✅ DEFAULT domain matches config`);
                }
            }
        }

        // Get schema for autosecure
        console.log('\n📋 autosecure table schema:');
        const autosecureSchema = await queryParams(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='autosecure'"
        );
        if (autosecureSchema.length > 0) {
            console.log(autosecureSchema[0].sql);
            const domainMatch = autosecureSchema[0].sql.match(/domain TEXT DEFAULT '([^']*)'/);
            if (domainMatch) {
                const defaultDomain = domainMatch[1];
                if (defaultDomain !== config.domains[0]) {
                    console.log(`\n⚠️  DEFAULT domain in DB: ${defaultDomain}`);
                    console.log(`   Config domain: ${config.domains[0]}`);
                    console.log(`   ❌ MISMATCH! This is the problem!`);
                } else {
                    console.log(`\n✅ DEFAULT domain matches config`);
                }
            }
        }

        console.log('\n' + '═'.repeat(60));
        console.log('\n💡 Solution:');
        console.log('   The database was created with old DEFAULT values.');
        console.log('   You need to update the table schema with:');
        console.log('   node db/fix_schema.js');
        console.log('');

    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

// Run if executed directly
if (require.main === module) {
    checkSchema()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('❌ Failed:', error);
            process.exit(1);
        });
}

module.exports = { checkSchema };
