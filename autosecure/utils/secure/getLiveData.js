const axios = require("axios");

module.exports = async () => {
  console.log("?? Starting Microsoft login process...");
  console.log("=== STARTING getLiveData with login.srf ===");
  
  try {
    console.log("Step 1: Making request to login.live.com/login.srf");
    
    const response = await axios({
      method: "GET",
      url: "https://login.live.com/login.srf",
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      maxRedirects: 5,
    });

    console.log("? Response received - Status:", response.status);
    console.log("?? Data length:", response.data.length);
    
    // Extract cookies
    const setCookieHeaders = response.headers["set-cookie"];
    if (!setCookieHeaders) {
      console.error("? No set-cookie headers found");
      return null;
    }
    
    const cookies = setCookieHeaders
      .map(cookie => cookie.split(';')[0])
      .join('; ');
    
    console.log("? Cookies extracted:", cookies.length, "chars");

    console.log("?? Searching for PPFT...");
    
    let ppft = null;
    
    // Microsoft's sFTTag contains the complete PPFT, but we need to extract it properly
    // The PPFT value can be very long and contain special characters
    
    // Method 1: Extract from sFTTag JSON field (most reliable for current Microsoft format)
    const sFTTagStart = response.data.indexOf('"sFTTag":"');
    if (sFTTagStart !== -1) {
      // Find the value attribute within the sFTTag
      const valueStart = response.data.indexOf('value=\\"', sFTTagStart);
      if (valueStart !== -1) {
        const valueBegin = valueStart + 8; // length of 'value=\\"'
        // Find the end of the value (look for the closing quote and backslash)
        const valueEnd = response.data.indexOf('\\"', valueBegin);
        if (valueEnd !== -1) {
          ppft = response.data.substring(valueBegin, valueEnd);
          console.log("? PPFT extracted from sFTTag:", ppft.substring(0, 30) + "...", `(${ppft.length} chars)`);
        }
      }
    }
    
    // Method 2: Fallback - try to find PPFT in the raw HTML
    if (!ppft) {
      const inputMatch = response.data.match(/<input[^>]*name="PPFT"[^>]*value="([^"]*)"/i);
      if (inputMatch && inputMatch[1]) {
        ppft = inputMatch[1];
        console.log("? PPFT found in HTML input:", ppft.substring(0, 30) + "...", `(${ppft.length} chars)`);
      }
    }
    
    // Method 3: Direct string manipulation to find the complete value
    if (!ppft) {
      // Look for the pattern more manually
      const ppftPattern = /"sFTName":"PPFT"/;
      const ppftIndex = response.data.search(ppftPattern);
      if (ppftIndex !== -1) {
        // Look for sFTTag after sFTName
        const sfTagIndex = response.data.indexOf('"sFTTag":', ppftIndex);
        if (sfTagIndex !== -1) {
          // Extract everything between the quotes of sFTTag
          const tagStart = response.data.indexOf('"', sfTagIndex + 9) + 1;
          const tagEnd = response.data.indexOf('"', tagStart + 1);
          const fullTag = response.data.substring(tagStart, tagEnd);
          
          // Now extract value from the full tag
          const valueMatch = fullTag.match(/value=\\"([^"\\]*(?:\\.[^"\\]*)*)/);
          if (valueMatch && valueMatch[1]) {
            ppft = valueMatch[1];
            console.log("? PPFT extracted via manual parsing:", ppft.substring(0, 30) + "...", `(${ppft.length} chars)`);
          }
        }
      }
    }
    
    if (!ppft) {
      console.error("? PPFT not found");
      
      // Show PPFT context for debugging
      const ppftContext = response.data.match(/.{0,100}PPFT.{0,200}/gi);
      if (ppftContext) {
        console.log("PPFT context:");
        ppftContext.slice(0, 3).forEach((context, i) => {
          console.log(`${i + 1}:`, context);
        });
      }
      
      return null;
    }

    // Look for login URL - Microsoft login.srf typically uses different URLs
    let loginLink = null;
    
    // Try to find the actual form action or post URL
    const urlPatterns = [
      /action="([^"]*login\.srf[^"]*)"/i,
      /action="([^"]*ppsecure[^"]*)"/i,
      /"sUrlPost":"([^"]*)"/i,
      /"urlPost":"([^"]*)"/i,
      /action="([^"]*post\.srf[^"]*)"/i,
    ];
    
    for (const pattern of urlPatterns) {
      const match = response.data.match(pattern);
      if (match && match[1]) {
        loginLink = match[1].startsWith('http') ? match[1] : `https://login.live.com${match[1]}`;
        console.log("? Login URL found:", loginLink);
        break;
      }
    }
    
    // Fallback to standard login.srf URL
    if (!loginLink) {
      loginLink = "https://login.live.com/login.srf?wa=wsignin1.0";
      console.log("?? Using fallback login URL:", loginLink);
    }

    const result = {
      cookies,
      ppft,
      loginLink
    };
    
    console.log("?? getLiveData completed successfully");
    console.log("?? Final result:", {
      cookiesLength: cookies.length,
      ppftLength: ppft.length,
      loginLink: loginLink
    });
    
    return result;
    
  } catch (error) {
    console.error("? getLiveData failed:");
    console.error("- Message:", error.message);
    console.error("- Code:", error.code);
    
    if (error.response) {
      console.error("- Response Status:", error.response.status);
      console.error("- Response StatusText:", error.response.statusText);
    }
    
    return null;
  }
};