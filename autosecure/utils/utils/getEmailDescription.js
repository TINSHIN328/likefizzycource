const { queryParams } = require("../../../db/database");
const { watchForEmail } = require("../../../mainbot/handlers/emailHandler");
const { extractCode } = require("./extractCode");

async function getEmailDescription(time, secEmail, getcode = false, checkdomain = false) {
    return new Promise((resolve) => {
        let hasResolved = false;

        const resolveOnce = (value) => {
            if (!hasResolved) {
                hasResolved = true;
                resolve(value);
            }
        };

        const domain = secEmail.split("@")[1];
        if (checkdomain && ["hotmail.com", "gmail.com", "outlook.com"].includes(domain)) {
            console.log(`Unverified email from supported domain: ${domain}`);
            resolveOnce(null);
            return;
        }

        // Set up email watcher
        watchForEmail(secEmail, async (emailData) => {
            if (emailData.time > time) {
                console.log(`📧 Email received via watcher for ${secEmail}`);
                if (getcode) {
                    const code = await extractCode(emailData.description);
                    resolveOnce(code);
                } else {
                    resolveOnce(emailData.description);
                }
            }
        });

        // Check database for emails
        setTimeout(async () => {
            if (!hasResolved) {
                try {
                    console.log(`🔍 Checking for emails to ${secEmail} after time ${time}`);
                    const results = await queryParams(
                        `SELECT description, time, sender, subject FROM emails 
                         WHERE receiver = ? AND time > ? 
                         ORDER BY time DESC LIMIT 10`,
                        [secEmail, time]
                    );

                    console.log(`📧 Found ${results.length} emails for ${secEmail}`);
                    
                    if (results && results.length > 0) {
                        // Log all found emails for debugging
                        results.forEach((email, index) => {
                            console.log(`📨 Email ${index + 1}: From ${email.sender}, Subject: ${email.subject}, Time: ${email.time}`);
                            console.log(`📝 Content preview: ${email.description.substring(0, 200)}...`);
                        });
                        
                        // Try to extract code from all emails, not just the first one
                        let extractedCode = null;
                        let bestDescription = results[0].description;
                        
                        for (const email of results) {
                            if (getcode) {
                                const code = await extractCode(email.description);
                                if (code) {
                                    console.log(`✅ Successfully extracted code: ${code} from email from ${email.sender}`);
                                    extractedCode = code;
                                    bestDescription = email.description;
                                    break;
                                }
                            }
                        }
                        
                        if (getcode) {
                            if (extractedCode) {
                                resolveOnce(extractedCode);
                            } else {
                                console.log(`❌ Could not extract code from any of the ${results.length} emails`);
                                // Try fallback method
                                const fallbackCode = await tryFallbackEmailMethod(secEmail, time);
                                if (fallbackCode) {
                                    console.log(`🔄 Fallback method found code: ${fallbackCode}`);
                                    resolveOnce(fallbackCode);
                                } else {
                                    resolveOnce(null);
                                }
                            }
                        } else {
                            resolveOnce(bestDescription);
                        }
                    } else {
                        console.log(`❌ No emails found for ${secEmail} after time ${time}`);
                        // Try fallback method - simulate email content
                        console.log(`🔄 Trying fallback method for ${secEmail}...`);
                        const fallbackCode = await tryFallbackEmailMethod(secEmail, time);
                        if (fallbackCode) {
                            console.log(`✅ Fallback method found code: ${fallbackCode}`);
                            resolveOnce(getcode ? fallbackCode : `Your verification code is: ${fallbackCode}`);
                        } else {
                            resolveOnce(null);
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error checking emails for ${secEmail}:`, error);
                    resolveOnce(null);
                }
            }
        }, 20000); // Increased timeout to 20s for better reliability
    });
}

// Fallback method that tries to get the code from Microsoft's API
async function tryFallbackEmailMethod(secEmail, time) {
    try {
        console.log(`🔄 Attempting fallback method for ${secEmail}`);
        
        // Wait a bit more for the email to arrive
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Try to check the database again with a longer time window
        const results = await queryParams(
            `SELECT description, time, sender, subject FROM emails 
             WHERE receiver = ? AND time > ? 
             ORDER BY time DESC LIMIT 5`,
            [secEmail, time - 30000] // Check emails from 30 seconds before
        );
        
        if (results && results.length > 0) {
            console.log(`🔄 Fallback found ${results.length} emails, trying to extract code...`);
            
            for (const email of results) {
                const code = await extractCode(email.description);
                if (code) {
                    console.log(`✅ Fallback successfully extracted code: ${code} from email from ${email.sender}`);
                    return code;
                }
            }
        }
        
        // Try to get the OTP code directly from Microsoft's API as last resort
        const axios = require('axios');
        
        try {
            const response = await axios.get(`https://login.live.com/GetOneTimeCode.srf`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 10000
            });
            
            console.log(`🔍 Microsoft OTP API response status: ${response.status}`);
            
            // Try to extract code from the response if it contains any
            if (response.data) {
                const code = await extractCode(response.data);
                if (code) {
                    console.log(`✅ Fallback API found code: ${code}`);
                    return code;
                }
            }
        } catch (apiError) {
            console.log(`⚠️ Microsoft API fallback failed: ${apiError.message}`);
        }
        
        console.log(`❌ All fallback methods failed for ${secEmail}`);
        return null;
        
    } catch (error) {
        console.error(`❌ Fallback method failed:`, error.message);
        return null;
    }
}

module.exports = { getEmailDescription };
