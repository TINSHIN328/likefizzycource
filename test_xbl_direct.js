const { getXBLTokenDirect } = require('./autosecure/utils/minecraft/xbl_direct');

async function testXBLDirect() {
    console.log('🧪 Testing Direct XBL Token Method with Cookie Session...');
    
    // Test with mock Microsoft cookies
    const mockMicrosoftCookies = {
        msauth: 'mock_msauth_token',
        loginCookie: 'mock_login_cookie'
    };
    
    try {
        const result = await getXBLTokenDirect(mockMicrosoftCookies);
        
        if (result) {
            console.log('\n✅ SUCCESS! XBL Token obtained:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🎮 XBL Token:', result.XBL.substring(0, 80) + '...');
            console.log('👤 UHS:', result.uhs);
            console.log('🔑 User Token:', result.userToken ? result.userToken.substring(0, 50) + '...' : 'N/A');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('\n✨ The direct XBL token method is working correctly!');
        } else {
            console.log('\n❌ FAILED: Could not obtain XBL token');
            console.log('This could mean:');
            console.log('  1. The Microsoft cookies are invalid or expired');
            console.log('  2. The account requires additional authentication');
            console.log('  3. There is a network issue');
        }
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('Stack:', error.stack);
    }
}

testXBLDirect();
