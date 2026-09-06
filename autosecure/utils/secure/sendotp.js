const axios = require("axios");
const otpmethod2 = require("../utils/otp2");

async function getFreshFlowToken() {
  try {
    const { data } = await axios.get(
      `https://login.live.com/oauth20_authorize.srf?client_id=4765445b-32c6-49b0-83e6-1d93765276ca&scope=openid&redirect_uri=https://www.office.com/landingv2&response_type=code&msproxy=1`
    );
    
    // Try multiple patterns to find the flow token
    let flowTokenMatch = data.match(/flowToken":"([^"]+)"/);
    if (!flowTokenMatch) {
      flowTokenMatch = data.match(/flowToken=([^&"']+)/);
    }
    if (!flowTokenMatch) {
      flowTokenMatch = data.match(/flowToken['"]\s*:\s*['"]([^'"]+)['"]/);
    }
    if (!flowTokenMatch) {
      flowTokenMatch = data.match(/flowToken['"]\s*:\s*['"]([^'"]+)['"]/i);
    }
    if (!flowTokenMatch) {
      // Try to find it in a script tag
      const scriptMatch = data.match(/<script[^>]*>.*?flowToken['"]\s*:\s*['"]([^'"]+)['"].*?<\/script>/is);
      if (scriptMatch) {
        flowTokenMatch = scriptMatch;
      }
    }
    
    if (flowTokenMatch) {
      console.log("Found flow token successfully in sendotp");
      return flowTokenMatch[1];
    } else {
      console.error("Could not find flow token in sendotp response. Response length:", data.length);
      return null;
    }
  } catch (error) {
    console.error("Error getting fresh flow token in sendotp:", error.message);
    return null;
  }
}

async function getFreshCookies() {
  try {
    const { headers } = await axios.get("https://login.live.com/");
    const setCookieHeaders = headers['set-cookie'] || [];
    
    const cookies = setCookieHeaders.map(cookie => {
      return cookie.split(';')[0];
    }).join('; ');
    
    return cookies;
  } catch (error) {
    console.error("Error getting fresh cookies:", error.message);
    return null;
  }
}

async function sendotp(email, secId) {
    try {
        await otpmethod2(email);

        // Get fresh flow token and cookies
        const [flowToken, cookies] = await Promise.all([
            getFreshFlowToken(),
            getFreshCookies()
        ]);
        
        if (!flowToken) {
            console.error("Failed to get fresh flow token");
            return false;
        }
        
        if (!cookies) {
            console.error("Failed to get fresh cookies");
            return false;
        }

        const { data } = await axios({
            method: 'post',
            url: "https://login.live.com/GetOneTimeCode.srf",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookies
            },
            data: `login=${encodeURIComponent(email)}&flowtoken=${encodeURIComponent(flowToken)}&purpose=eOTT_OtcLogin&channel=Email&AltEmailE=${secId}`
        });

        console.log("OTP sent successfully via sendotp");
        return true;
    } catch (error) {
        console.error('Error sending code:', error);
        return false;
    }
}

module.exports = sendotp;
