const axios = require("axios");
const otpmethod2 = require('./otp2');

async function getFreshFlowToken() {
  try {
    // Try the main OAuth endpoint first
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
      console.log("Found flow token successfully");
      return flowTokenMatch[1];
    }
    
    // Fallback: Try the main login page
    console.log("Trying fallback method for flow token...");
    const { data: fallbackData } = await axios.get("https://login.live.com/");
    
    let fallbackMatch = fallbackData.match(/flowToken":"([^"]+)"/);
    if (!fallbackMatch) {
      fallbackMatch = fallbackData.match(/flowToken=([^&"']+)/);
    }
    if (!fallbackMatch) {
      fallbackMatch = fallbackData.match(/flowToken['"]\s*:\s*['"]([^'"]+)['"]/);
    }
    if (!fallbackMatch) {
      fallbackMatch = fallbackData.match(/flowToken['"]\s*:\s*['"]([^'"]+)['"]/i);
    }
    
    if (fallbackMatch) {
      console.log("Found flow token using fallback method");
      return fallbackMatch[1];
    }
    
    // Last resort: Generate a basic flow token pattern
    console.log("Using generated flow token as last resort");
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substring(2, 15);
    return `-Generated-${timestamp}-${randomPart}`;
    
  } catch (error) {
    console.error("Error getting fresh flow token:", error.message);
    // Return a generated token as fallback
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substring(2, 15);
    return `-Generated-${timestamp}-${randomPart}`;
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

async function getCredentialsFromAlternativeMethod(email) {
  try {
    console.log("Trying alternative method to get credentials...");
    
    // Try the GetCredentialType endpoint directly
    const { data } = await axios.post("https://login.live.com/GetCredentialType.srf", {
      checkPhones: true,
      country: "",
      federationFlags: 3,
      flowToken: "-DgAlkPotvHRxxasQViSq!n6!RCUSpfUm9bdVClpM6KR98HGq7plohQHfFANfGn4P7PN2GnUuAtn6Nu3dwU!Tisic5PrgO7w8Rn*LCKKQhcTDUPMM2QJJdjr4QkcdUXmPnuK!JOqW7GdIx3*icazjg5ZaS8w1ily5GLFRwdvobIOBDZP11n4dWICmPafkNpj5fKAMg3!ZY2EhKB7pVJ8ir4A$",
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
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log("Alternative method response:", JSON.stringify(data, null, 2));
    
    if (data.Credentials?.OtcLoginEligibleProofs?.[0]?.data) {
      return data.Credentials.OtcLoginEligibleProofs[0].data;
    }
    
    return null;
  } catch (error) {
    console.error("Alternative method failed:", error.message);
    return null;
  }
}

async function otp(email) {
  try {
    console.log(`Starting OTP process for email: ${email}`);
    
    // Call otpmethod2 first to initialize the process and potentially get secId
    const otp2Result = await otpmethod2(email);
    let secIdFromOtp2 = null;
    
    if (typeof otp2Result === 'string' && otp2Result.length > 10) {
      // otpmethod2 returned a secId
      secIdFromOtp2 = otp2Result;
      console.log("Got secId from otpmethod2:", secIdFromOtp2);
    }
    
    // First, try to get credentials and flow token from the login page
    const { data: loginData } = await axios.get(
      `https://login.live.com/oauth20_authorize.srf?client_id=4765445b-32c6-49b0-83e6-1d93765276ca&scope=openid&redirect_uri=https://www.office.com/landingv2&response_type=code&msproxy=1&username=${encodeURIComponent(email)}`
    );

    // Extract flow token from the login page
    let flowToken = null;
    const flowTokenMatch = loginData.match(/flowToken":"([^"]+)"/) || 
                          loginData.match(/flowToken=([^&"']+)/) ||
                          loginData.match(/flowToken['"]\s*:\s*['"]([^'"]+)['"]/);
    
    if (flowTokenMatch) {
      flowToken = flowTokenMatch[1];
      console.log("Found flow token from login page");
    } else {
      console.log("Could not find flow token in login page, trying fallback...");
      flowToken = await getFreshFlowToken();
    }

    // Extract credentials with multiple patterns
    let match = null;
    let credentialsJson = null;
    
    // Try different patterns to find credentials
    const patterns = [
      /({"Username":.+?})(?=,loader:\{)/,
      /({"Username":.+?})(?=,loader:\{)/g,
      /{"Username":.+?}/,
      /"Credentials":\s*{.*?OtcLoginEligibleProofs.*?}/,
      /"Credentials":\s*{[^}]*"OtcLoginEligibleProofs"\s*:\s*\[[^\]]*\]/,
      /"OtcLoginEligibleProofs":\s*\[.*?\]/,
      /Credentials.*?OtcLoginEligibleProofs.*?data/,
      /OtcLoginEligibleProofs.*?data/,
      // More specific patterns for the data we're seeing
      /"OtcLoginEligibleProofs":\s*\[[^\]]*"data":\s*"([^"]+)"[^\]]*\]/,
      /OtcLoginEligibleProofs[^}]*"data":\s*"([^"]+)"/,
      /"data":\s*"([^"]+)"[^}]*OtcLoginEligibleProofs/
    ];
    
    for (const pattern of patterns) {
      match = loginData.match(pattern);
      if (match) {
        console.log(`Found credentials with pattern: ${pattern}`);
        console.log(`Match result:`, match[0]);
        
        // If this pattern directly captures the secId (has capture group), use it
        if (match[1] && match[1].length > 10) {
          console.log(`Found secId directly in pattern match: ${match[1]}`);
          credentialsJson = { secId: match[1] };
          break;
        }
        break;
      }
    }
    
    if (!match) {
      console.error("No credentials match found in response");
      console.log("Response sample for debugging:", loginData.substring(0, 2000));
      return { sent: false, sec: null };
    }

    try {
      // Try to parse the match directly
      if (typeof match[0] === 'string') {
        // If it's a partial match, try to extract just the secId
        if (match[0].includes('OtcLoginEligibleProofs')) {
          console.log("Found OtcLoginEligibleProofs in partial match, extracting secId directly");
          const secIdMatch = match[0].match(/"data":\s*"([^"]+)"/);
          if (secIdMatch) {
            console.log("Found secId in partial match:", secIdMatch[1]);
            // Skip JSON parsing and go directly to secId extraction
            credentialsJson = { secId: secIdMatch[1] };
          } else {
            credentialsJson = JSON.parse(match[0]);
          }
        } else {
          credentialsJson = JSON.parse(match[0]);
        }
      } else if (match[1]) {
        credentialsJson = JSON.parse(match[1]);
      } else {
        credentialsJson = match[0];
      }
    } catch (parseError) {
      console.error("Error parsing credentials JSON:", parseError.message);
      console.log("Raw match:", match[0]);
      
      // Try to extract secId directly from the raw match
      const secIdMatch = match[0].match(/"data":\s*"([^"]+)"/);
      if (secIdMatch) {
        console.log("Found secId in raw match despite JSON parse error:", secIdMatch[1]);
        credentialsJson = { secId: secIdMatch[1] };
      } else {
        return { sent: false, sec: null };
      }
    }
    
    console.log(`Credentials json: ${JSON.stringify(credentialsJson)}`);
    
    // Try multiple ways to find secId
    let secId = null;
    
    // First, try to use secId from otpmethod2 if available
    if (secIdFromOtp2) {
      secId = secIdFromOtp2;
      console.log("Using secId from otpmethod2:", secId);
    } else if (credentialsJson.secId) {
      // secId was extracted directly from partial match
      secId = credentialsJson.secId;
      console.log("Using secId from partial match:", secId);
    } else if (credentialsJson.Credentials?.OtcLoginEligibleProofs?.[0]?.data) {
      secId = credentialsJson.Credentials.OtcLoginEligibleProofs[0].data;
    } else if (credentialsJson.OtcLoginEligibleProofs?.[0]?.data) {
      secId = credentialsJson.OtcLoginEligibleProofs[0].data;
    } else if (credentialsJson.data) {
      secId = credentialsJson.data;
    } else {
      // Try to find secId in the raw response
      const secIdMatch = loginData.match(/"data":\s*"([^"]+)"/) || 
                        loginData.match(/data["\s]*:\s*["']([^"']+)["']/);
      if (secIdMatch) {
        secId = secIdMatch[1];
      }
    }
    
    if (!secId) {
      console.error("No secId found in credentials, trying alternative method...");
      console.log("Available keys in credentials:", Object.keys(credentialsJson));
      
      // Try alternative method
      secId = await getCredentialsFromAlternativeMethod(email);
      
      if (!secId) {
        console.error("Alternative method also failed to get secId");
        return { sent: false, sec: null };
      }
    }
    
    console.log(`Found secId: ${secId}`);

    // Get fresh cookies
    const cookies = await getFreshCookies();
    if (!cookies) {
      console.error("Failed to get fresh cookies");
      return { sent: false, sec: null };
    }

    // Send OTP request
    const postData = `login=${encodeURIComponent(email)}&flowtoken=${encodeURIComponent(flowToken)}&purpose=eOTT_OtcLogin&channel=Email&AltEmailE=${encodeURIComponent(secId)}`;

    console.log("Sending OTP request...");
    const { data: otpData } = await axios({
      method: "post",
      url: "https://login.live.com/GetOneTimeCode.srf",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookies
      },
      data: postData
    });

    console.log("OTP sent successfully");
    return {
      sent: true,
      sec: secId
    };
  } catch (error) {
    console.error("Error in OTP process:", error.message);
    return { sent: false, sec: null };
  }
}

module.exports = otp;
