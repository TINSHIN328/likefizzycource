function extractCode(body) {
    console.log(`Extracting code from email body (length: ${body.length})`);
    console.log(`Email body preview: ${body.substring(0, 500)}...`);
    
    // Clean the body text - remove HTML tags and normalize whitespace
    const cleanBody = body
        .replace(/<[^>]*>/g, ' ') // Remove HTML tags
        .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
        .replace(/&amp;/g, '&') // Replace &amp; with &
        .replace(/&lt;/g, '<') // Replace &lt; with <
        .replace(/&gt;/g, '>') // Replace &gt; with >
        .replace(/&quot;/g, '"') // Replace &quot; with "
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    
    console.log(`Cleaned body preview: ${cleanBody.substring(0, 500)}...`);
    
    // Multiple patterns to catch different Microsoft OTP formats
    const patterns = [
        // Microsoft specific patterns
        /security[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /verification[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /one[^0-9]*time[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /use[^0-9]*this[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /enter[^0-9]*this[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /your[^0-9]*code[^0-9]*is[^0-9]*([0-9]{6,7})/i,
        /code[^0-9]*is[^0-9]*([0-9]{6,7})/i,
        /verification[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /otp[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        
        // Generic patterns
        /[^0-9]([0-9]{6,7})[^0-9]/, // 6-7 digits surrounded by non-digits
        / [0-9]{6,7}/, // space followed by 6-7 digits
        /:[0-9]{6,7}/, // colon followed by 6-7 digits
        /\b[0-9]{6,7}\b/, // word boundary 6-7 digits
        /code[:\s]*([0-9]{6,7})/i, // "code: 123456" format
        /verification[:\s]*([0-9]{6,7})/i, // "verification: 123456" format
        /otp[:\s]*([0-9]{6,7})/i, // "otp: 123456" format
        /your[^0-9]*([0-9]{6,7})/i, // "your 123456" format
        /enter[^0-9]*([0-9]{6,7})/i, // "enter 123456" format
        /([0-9]{6,7})[^0-9]/, // 6-7 digits followed by non-digit
        
        // Microsoft account specific patterns
        /microsoft[^0-9]*account[^0-9]*([0-9]{6,7})/i,
        /sign[^0-9]*in[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /login[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        
        // Fallback patterns
        /[0-9]{6,7}/ // Any 6-7 digit sequence (fallback)
    ];

    for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const match = cleanBody.match(pattern);
        
        if (match) {
            const code = match[1] || match[0];
            const cleanCode = code.replace(/[^0-9]/g, ""); // Strip non-digits
            
            if (cleanCode.length >= 6 && cleanCode.length <= 7) {
                console.log(`✅ Got a code: ${cleanCode} using pattern ${i + 1} (${pattern})`);
                return cleanCode;
            }
        }
    }

    // Try to find any 6-7 digit sequence in the entire body as last resort
    const allNumbers = cleanBody.match(/\d+/g);
    if (allNumbers) {
        for (const num of allNumbers) {
            if (num.length >= 6 && num.length <= 7) {
                console.log(`✅ Found code in numbers: ${num}`);
                return num;
            }
        }
    }

    console.log("❌ No valid code found in email body");
    return null;
}

module.exports = {
    extractCode,
};
