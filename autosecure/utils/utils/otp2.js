const axios = require('axios')

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
      console.log("Found flow token successfully in otp2");
      return flowTokenMatch[1];
    } else {
      console.error("Could not find flow token in otp2 response. Response length:", data.length);
      return null;
    }
  } catch (error) {
    console.error("Error getting fresh flow token in otp2:", error.message);
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
    console.error("Error getting fresh cookies in otp2:", error.message);
    return null;
  }
}

module.exports = async function otpmethod2(email) {
    try {
        const result = await sendRequest(email)
        return result
    } catch (error) {
        console.error("Error in otpmethod2:", error.message);
        return false
    }
}

async function sendRequest(email) {
    // Get fresh flow token and cookies
    const [flowToken, cookies] = await Promise.all([
        getFreshFlowToken(),
        getFreshCookies()
    ]);
    
    if (!flowToken) {
        throw new Error("Failed to get fresh flow token");
    }
    
    if (!cookies) {
        throw new Error("Failed to get fresh cookies");
    }

    const { data } = await axios({
        method: "POST",
        url: "https://login.live.com/GetCredentialType.srf",
        headers: {
            Cookie: cookies,
            'Content-Type': 'application/json'
        },
        data: {
            checkPhones: true,
            country: "",
            federationFlags: 3,
            flowToken: flowToken,
            forceotclogin: true,
            isCookieBannerShown: true,
            isExternalFederationDisallowed: true,
            isFederationDisabled: true,
            isFidoSupported: true,
            isOtherIdpSupported: true,
            isRemoteConnectSupported: true,
            isRemoteNGCSupported: true,
            isSignup: true,
            otclogindisallowed: true,
            username: email
        }
    })
    
    console.log("otpmethod2 response:", JSON.stringify(data, null, 2));
    
    // Try to extract secId from the response
    if (data.Credentials?.OtcLoginEligibleProofs?.[0]?.data) {
        console.log("Found secId in otpmethod2:", data.Credentials.OtcLoginEligibleProofs[0].data);
        return data.Credentials.OtcLoginEligibleProofs[0].data;
    }
    
    return true;
}
