/**
 * Auth HTML Pages
 *
 * Inline HTML pages for login flow. Styled to match native-bridge.
 */

/**
 * Login page with email input
 * Styled to match merchant-react-app login page
 */
export function getLoginPageHtml(): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <title>Login - Eeko</title>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self'; font-src https://fonts.gstatic.com;">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: 'Space Mono', monospace;
        background: #040F0F;
        color: #F9F9F9;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .card {
        max-width: 400px;
        width: 100%;
        background: hsl(220, 20%, 8%);
        border: 1px solid hsl(0, 0%, 25%);
        border-radius: 8px;
      }
      .card-header {
        padding: 24px 24px 0;
        text-align: center;
      }
      .card-content {
        padding: 24px;
      }
      h1 {
        color: #F9F9F9;
        font-size: 24px;
        font-weight: 700;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      input {
        width: 100%;
        height: 40px;
        padding: 0 12px;
        background: hsl(220, 20%, 12%);
        border: 1px solid hsl(0, 0%, 25%);
        border-radius: 6px;
        color: #F9F9F9;
        font-family: inherit;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }
      input:focus {
        border-color: #013FF6;
        outline: none;
        box-shadow: 0 0 0 1px #013FF6;
      }
      input::placeholder {
        color: #686868;
      }
      button {
        width: 100%;
        height: 40px;
        padding: 0 24px;
        background: #B6FF00;
        border: none;
        border-radius: 9999px;
        color: #040F0F;
        font-family: inherit;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      button:hover {
        background: rgba(182, 255, 0, 0.9);
      }
      button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .message {
        font-size: 14px;
        padding: 12px;
        border-radius: 8px;
        text-align: center;
      }
      .message.success {
        background: rgba(182, 255, 0, 0.1);
        border: 1px solid rgba(182, 255, 0, 0.3);
        color: #B6FF00;
      }
      .message.error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #EF4444;
      }
      .message.hidden {
        display: none;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="card-header">
        <h1>Login</h1>
      </div>
      <div class="card-content">
        <form id="loginForm">
          <input type="email" id="email" placeholder="Enter your email" required autocomplete="email" autofocus>
          <button type="submit" id="submitBtn">Send Magic Link</button>
        </form>
        <p id="message" class="message hidden"></p>
      </div>
    </div>
    <script>
      const form = document.getElementById('loginForm');
      const emailInput = document.getElementById('email');
      const submitBtn = document.getElementById('submitBtn');
      const message = document.getElementById('message');

      form.onsubmit = async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();

        if (!email) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
        message.className = 'message hidden';

        try {
          const response = await fetch('/auth/send-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          });

          const data = await response.json();

          if (response.ok) {
            message.textContent = 'Check your email for a magic link!';
            message.className = 'message success';
            submitBtn.textContent = 'Link Sent!';
          } else {
            message.textContent = data.error || 'Failed to send link. Please try again.';
            message.className = 'message error';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Magic Link';
          }
        } catch (err) {
          message.textContent = 'Connection error. Please try again.';
          message.className = 'message error';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Magic Link';
        }
      };
    </script>
  </body>
</html>`
}

/**
 * Success page after auth redirect
 * Extracts tokens from URL fragment and POSTs to server
 */
export function getSuccessPageHtml(): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <title>Authentication Success - Eeko</title>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self'; font-src https://fonts.gstatic.com;">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: 'Space Mono', monospace;
        background: #040F0F;
        color: #F9F9F9;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .container {
        max-width: 400px;
        width: 100%;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 48px;
        border-radius: 16px;
        text-align: center;
      }
      .icon-wrapper {
        width: 80px;
        height: 80px;
        margin: 0 auto 32px;
        background: #013FF6;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: pulse 2s infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
      }
      h1 {
        color: #F9F9F9;
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 16px;
      }
      .success-text {
        color: #B6FF00;
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 24px;
      }
      .info-text {
        color: #686868;
        font-size: 12px;
      }
      .error-text {
        color: #FF6B6B;
        font-size: 14px;
        margin-bottom: 24px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="icon-wrapper">
        <svg width="40" height="40" fill="white" viewBox="0 0 24 24">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
        </svg>
      </div>
      <h1>Authentication Successful</h1>
      <p class="success-text" id="statusText">You have been successfully signed in to Eeko</p>
      <p class="info-text" id="infoText">This window will close automatically in 5 seconds.</p>
    </div>
    <script>
      try {
        // Extract tokens from URL fragment (after #)
        const fragment = window.location.hash.substring(1);
        const params = new URLSearchParams(fragment);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          // Send tokens back to the server
          fetch('/auth/tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: accessToken,
              refresh_token: refreshToken
            })
          }).catch(() => {
            // Silent error handling
          });
        } else {
          // No tokens found - show error
          document.querySelector('.icon-wrapper').innerHTML = '<svg width="40" height="40" fill="white" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
          document.getElementById('statusText').textContent = 'Authentication failed';
          document.getElementById('statusText').className = 'error-text';
          document.getElementById('infoText').textContent = 'No authentication tokens found. Please try again.';
        }

        setTimeout(() => {
          window.close();
        }, 5000);
      } catch (error) {
        // Silent error handling
        setTimeout(() => {
          window.close();
        }, 5000);
      }
    </script>
  </body>
</html>`
}

/**
 * Error page for auth failures
 */
export function getErrorPageHtml(errorMessage: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <title>Authentication Error - Eeko</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: 'Space Mono', monospace;
        background: #040F0F;
        color: #F9F9F9;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .container {
        max-width: 400px;
        width: 100%;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 48px;
        border-radius: 16px;
        text-align: center;
      }
      .icon-wrapper {
        width: 80px;
        height: 80px;
        margin: 0 auto 32px;
        background: #FF6B6B;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      h1 {
        color: #F9F9F9;
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 16px;
      }
      .error-text {
        color: #FF6B6B;
        font-size: 14px;
        margin-bottom: 24px;
      }
      .info-text {
        color: #686868;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="icon-wrapper">
        <svg width="40" height="40" fill="white" viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </div>
      <h1>Authentication Error</h1>
      <p class="error-text">${errorMessage}</p>
      <p class="info-text">Please close this window and try again.</p>
    </div>
  </body>
</html>`
}
