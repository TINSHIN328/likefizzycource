const axios = require("axios");

module.exports = async (name, canary2, amrp, amsc) => {
  try {
    let { data, status, headers } = await axios({
      method: "POST",
      url: "https://account.live.com/AddAssocId",
      headers: {
        Cookie: `AMRPSSecAuth=${amrp}; amsc=${amsc};`,
      },
      data: `canary=${encodeURIComponent(canary2)}&PostOption=NONE&SingleDomain=outlook.com&UpSell=&AddAssocIdOptions=LIVE&AssociatedIdLive=${name}`,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    console.log(`[addAlias] Response status: ${status}, Content-Type: ${headers['content-type']}`);

    // Check for error messages in response
    if (data.includes("We limit how frequently you can change your primary alias.")) {
      console.log('[addAlias] Alias changes are limited (rate limit detected)');
      return false; 
    }

    if (data.includes('code="1213"')) {
      console.log('[addAlias] Alias changes are limited (code 1213)');
      return false; 
    }

    // Check for other common error messages
    if (data.includes("error") || data.includes("Error") || data.includes("INVALID")) {
      console.log('[addAlias] Error in response detected');
      return false;
    }

    // Check for success indicators - multiple patterns
    // Pattern 1: alias= in the response (common redirect pattern)
    let match = data.match(/alias=.+?(;|&|")/);
    if (match && match[0]) {
      console.log(`[addAlias] ✓ Added! (Pattern 1: alias= found)`);
      return true;
    }

    // Pattern 2: Check if response contains association success indicators
    if (data.includes("WLXAssociatedId") || data.includes("associatedId")) {
      console.log(`[addAlias] ✓ Added! (Pattern 2: WLXAssociatedId found)`);
      return true;
    }

    // Pattern 3: Check for successful redirect or redirect URL with alias
    if (data.match(/location\s*[:=]\s*["']?https?:\/\/[^\s"']+alias=/i)) {
      console.log(`[addAlias] ✓ Added! (Pattern 3: Redirect with alias)`);
      return true;
    }

    // Pattern 4: 302 redirect or Location header with alias
    if (headers.location && headers.location.includes('alias=')) {
      console.log(`[addAlias] ✓ Added! (Pattern 4: Location header with alias)`);
      return true;
    }

    // Pattern 5: Empty response or minimal response usually means success
    if (!data || data.length < 100) {
      console.log(`[addAlias] ⚠ Empty/minimal response (${data.length} bytes). Treating as potential success.`);
      // Empty responses sometimes indicate success, return true
      return true;
    }

    console.log(`[addAlias] ✗ Failed - no success pattern matched. Response length: ${data.length}`);
    console.log(`[addAlias] Response preview: ${data.substring(0, 200)}`);
    return false;

  } catch (error) {
    console.error(`[addAlias] Error during POST request:`, error.message);
    console.error(`[addAlias] Status: ${error.response?.status}`);
    console.error(`[addAlias] Response preview: ${error.response?.data?.substring(0, 200)}`);
    return false;
  }
};
