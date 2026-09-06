// View switching
let currentVerificationUserId = null;
let currentVerificationToken = null;

function showQuickLogin() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'none';
  document.querySelector('.auth-panel').style.display = 'block';
}

function showManualLogin() {
  document.querySelector('.auth-panel').style.display = 'none';
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
}

function showRegistration() {
  document.querySelector('.auth-panel').style.display = 'none';
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
  // Reset registration form
  document.getElementById('register-step-1').style.display = 'block';
  document.getElementById('register-step-2').style.display = 'none';
  document.getElementById('register-step-3').style.display = 'none';
  document.getElementById('register-user').value = '';
  document.getElementById('register-code').value = '';
  document.getElementById('register-pass').value = '';
  document.getElementById('register-pass-confirm').value = '';
  currentVerificationUserId = null;
  currentVerificationToken = null;
}

function showStatus(elementId, message, type = 'info') {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `status-text ${type}`;
}

function hideStatus(elementId) {
  const el = document.getElementById(elementId);
  el.style.display = 'none';
  el.className = 'status-text';
}

// Manual Login
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-pass').value;

    if (!userId || !password) {
      showStatus('login-status', 'Please enter both Discord ID and password', 'error');
      return;
    }

    showStatus('login-status', 'Logging in...', 'info');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password })
      });

      const data = await res.json();

      if (data.error) {
        showStatus('login-status', data.message || 'Login failed', 'error');
      } else {
        showStatus('login-status', 'Login successful!', 'success');
      }
    } catch (err) {
      showStatus('login-status', 'Login failed. Please try again.', 'error');
    }
  });
}

// Registration: Send verification code
async function sendVerificationCode() {
  const userId = document.getElementById('register-user').value.trim();
  
  if (!userId) {
    showStatus('register-status', 'Please enter your Discord ID', 'error');
    return;
  }

  if (!/^\d{17,19}$/.test(userId)) {
    showStatus('register-status', 'Invalid Discord ID format', 'error');
    return;
  }

  showStatus('register-status', 'Sending verification code...', 'info');

  try {
    const res = await fetch('/api/auth/send-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });

    const data = await res.json();

    if (data.error) {
      showStatus('register-status', data.message || 'Failed to send code', 'error');
    } else {
      currentVerificationUserId = userId;
      currentVerificationToken = data.token;
      showStatus('register-status', 'Verification code sent to your Discord DMs!', 'success');
      
      // Move to step 2
      document.getElementById('register-step-1').style.display = 'none';
      document.getElementById('register-step-2').style.display = 'block';
      document.getElementById('register-code').focus();
    }
  } catch (err) {
    showStatus('register-status', 'Failed to send verification code. Please try again.', 'error');
  }
}

// Registration: Verify code and move to password step
const registerCodeInput = document.getElementById('register-code');
if (registerCodeInput) {
  registerCodeInput.addEventListener('input', async (e) => {
    const code = e.target.value.trim();
    
    if (code.length === 6) {
      showStatus('register-status', 'Verifying code...', 'info');

      try {
        const res = await fetch('/api/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId: currentVerificationUserId, 
            code,
            token: currentVerificationToken
          })
        });

      const data = await res.json();

      if (data.error) {
        showStatus('register-status', data.message || 'Invalid verification code', 'error');
        e.target.value = '';
      } else {
        showStatus('register-status', 'Code verified! Set your password', 'success');
        
        // Move to step 3
        document.getElementById('register-step-2').style.display = 'none';
        document.getElementById('register-step-3').style.display = 'block';
        document.getElementById('register-pass').focus();
      }
    } catch (err) {
      showStatus('register-status', 'Verification failed. Please try again.', 'error');
      e.target.value = '';
    }
  }
  });
}

// Registration: Complete registration with password
async function completeRegistration() {
  const password = document.getElementById('register-pass').value;
  const confirmPassword = document.getElementById('register-pass-confirm').value;

  if (!password || !confirmPassword) {
    showStatus('register-status', 'Please fill in both password fields', 'error');
    return;
  }

  if (password.length < 8) {
    showStatus('register-status', 'Password must be at least 8 characters', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showStatus('register-status', 'Passwords do not match', 'error');
    return;
  }

  showStatus('register-status', 'Creating your account...', 'info');

  try {
    const res = await fetch('/api/auth/complete-registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userId: currentVerificationUserId,
        password,
        token: currentVerificationToken
      })
    });

    const data = await res.json();

    if (data.error) {
      showStatus('register-status', data.message || 'Registration failed', 'error');
    } else {
      showStatus('register-status', 'Registration successful!', 'success');
    }
  } catch (err) {
    showStatus('register-status', 'Registration failed. Please try again.', 'error');
  }
}

// Redeem form
document.addEventListener('DOMContentLoaded', () => {
  const redeemForm = document.getElementById('redeem-form');
  console.log('Redeem form found:', redeemForm); // Debug
  
  if (redeemForm) {
    redeemForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('Form submitted'); // Debug
      
      const userId = document.getElementById('redeem-user').value.trim();
      const license = document.getElementById('redeem-license').value.trim();

      console.log('User ID:', userId, 'License:', license); // Debug

      if (!userId || !license) {
        showStatus('redeem-status', 'Please enter both Discord ID and license key', 'error');
        return;
      }

      showStatus('redeem-status', 'Redeeming key...', 'info');

      try {
        const res = await fetch('/api/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, license })
        });

        const data = await res.json();
        console.log('Response:', data); // Debug

        if (data.error) {
          showStatus('redeem-status', data.message || 'Redemption failed', 'error');
        } else {
          showStatus('redeem-status', 'Key redeemed successfully! You can now register/login.', 'success');
          document.getElementById('redeem-form').reset();
        }
      } catch (err) {
        console.error('Error:', err); // Debug
        showStatus('redeem-status', 'Redemption failed. Please try again.', 'error');
      }
    });
  } else {
    console.error('Redeem form not found!'); // Debug
  }
});
