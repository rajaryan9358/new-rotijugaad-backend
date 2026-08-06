const express = require('express');

const router = express.Router();

const APP_SCHEME      = process.env.APP_DEEPLINK_SCHEME || 'rotijugaad';
const ANDROID_PACKAGE = 'com.rotijugaad.app';

const PLAY_STORE_URL =
  process.env.PLAY_STORE_URL ||
  `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

const IOS_APP_STORE_URL = process.env.IOS_APP_STORE_URL || '';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Android Intent URI — Chrome resolves this natively:
//   • app installed  → opens the app directly
//   • not installed  → follows browser_fallback_url (Play Store)
// No JS timeout needed; no ERR_UNKNOWN_URL_SCHEME page.
function buildIntentUrl(appUrl) {
  const withoutScheme = appUrl.replace(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//, '');
  const fallback = encodeURIComponent(PLAY_STORE_URL);
  return `intent://${withoutScheme}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

function renderPage({ title, appUrl }) {
  const safeTitle   = escapeHtml(title);
  const intentUrl   = buildIntentUrl(appUrl);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px 24px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        background: #f9fafb;
        color: #111;
        text-align: center;
      }
      h2  { margin: 0 0 8px; font-size: 20px; }
      #msg { margin: 0 0 28px; color: #6b7280; font-size: 15px; }
      .store-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 13px 22px;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 600;
        color: #fff;
        text-decoration: none;
        margin: 6px;
      }
      .play  { background: #1a73e8; }
      .apple { background: #000; }
    </style>
  </head>
  <body>
    <h2>${safeTitle}</h2>
    <p id="msg">Opening Roti Jugaad…</p>
    <div id="store-links" style="display:none">
      ${PLAY_STORE_URL  ? `<a class="store-btn play"  href="${escapeHtml(PLAY_STORE_URL)}">Get it on Google Play</a>` : ''}
      ${IOS_APP_STORE_URL ? `<a class="store-btn apple" href="${escapeHtml(IOS_APP_STORE_URL)}">Download on App Store</a>` : ''}
    </div>

    <script>
      (function () {
        var ua        = navigator.userAgent || '';
        var isIOS     = /iPhone|iPad|iPod/i.test(ua);
        var isAndroid = /Android/i.test(ua);

        var appUrl    = ${JSON.stringify(appUrl)};
        var intentUrl = ${JSON.stringify(intentUrl)};
        var appStore  = ${JSON.stringify(IOS_APP_STORE_URL)};

        function showStoreLinks(msg) {
          document.getElementById('msg').textContent = msg || '';
          document.getElementById('store-links').style.display = 'block';
        }

        /* ── Android ─────────────────────────────────────────────────────────
           Intent URI lets Chrome handle the fallback natively — if the app
           is not installed, Chrome itself follows browser_fallback_url.
           We never see ERR_UNKNOWN_URL_SCHEME. */
        if (isAndroid) {
          window.location.replace(intentUrl);
          // Safety net: if the intent somehow doesn't resolve show store links.
          setTimeout(function () {
            if (!document.hidden) showStoreLinks('Install the app to continue.');
          }, 2500);
          return;
        }

        /* ── iOS ─────────────────────────────────────────────────────────────
           Try the custom scheme. If the app opens, the page goes hidden
           (document.hidden → true). If it stays visible after the timeout
           the app is not installed → send to App Store. */
        if (isIOS) {
          if (!appStore) { showStoreLinks('Install the app to continue.'); return; }

          var start = Date.now();
          window.location.href = appUrl;

          setTimeout(function () {
            // Guard: if the timer was suspended (page hidden = app opened),
            // or it ran very late, don't redirect to the store.
            if (document.hidden || Date.now() - start > 3000) return;
            window.location.replace(appStore);
          }, 1500);
          return;
        }

        /* ── Desktop / other ─────────────────────────────────────────────── */
        showStoreLinks('Scan the QR code or open this link on your phone.');
      })();
    </script>
  </body>
</html>`;
}

function sendPage(res, page) {
  res.status(200)
    .set('Content-Type', 'text/html')
    .set('Cache-Control', 'no-store')
    .send(page);
}

router.get('/jobs/:slug', (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const appUrl = `${APP_SCHEME}://app/jobs/${encodeURIComponent(slug)}`;
  sendPage(res, renderPage({ title: 'Job details', appUrl }));
});

router.get('/candidates/:slug', (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const appUrl = `${APP_SCHEME}://app/candidates/${encodeURIComponent(slug)}`;
  sendPage(res, renderPage({ title: 'Candidate details', appUrl }));
});

router.get('/referral/:code', (req, res) => {
  const code = String(req.params.code || '').trim();
  const appUrl = `${APP_SCHEME}://app/referral/${encodeURIComponent(code)}`;
  sendPage(res, renderPage({ title: 'Referral', appUrl }));
});

module.exports = router;
