const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { connectDB } = require('./config/db');
const { authenticate } = require('./middleware/auth');

const app = express();

// Last-resort guard: log unhandled promise rejections so background jobs
// (like push notifications) can't take down the process due to strict
// unhandled-rejection settings.
process.on('unhandledRejection', (reason) => {
	console.error('[process] unhandledRejection', reason);
});

// Trust the first proxy hop so req.ip reflects the real client IP when
// the app runs behind Nginx, a cloud load balancer, or a reverse proxy.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// ─── Rate limiting (mobile app / user-side only) ──────────────────────────────
//
// Admin web routes carry no rate limit — they are accessed only by authenticated
// internal users behind the admin panel.
//
// Two tiers for mobile/user-side:
//   1. otpLimiter     — 10 req / 5 min per IP  → OTP send & verify endpoints
//   2. mobileApiLimiter — 500 req / 5 min per IP → all other /api/app/* routes
//
// OTP limiter is registered first; its stricter counter takes effect before the
// broader mobile limiter, which runs independently on the same requests.

const otpLimiter = rateLimit({
	windowMs: 5 * 60 * 1000,
	max: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Too many OTP requests. Please try again in 5 minutes.' },
});

const mobileApiLimiter = rateLimit({
	windowMs: 5 * 60 * 1000,
	max: 500,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Too many requests. Please try again in 5 minutes.' },
});

// OTP endpoints (mobile app auth + legacy compat routes)
app.use('/api/app/auth', otpLimiter);
app.use('/api/login', otpLimiter);
app.use('/api/signup', otpLimiter);

// Broader limiter for all remaining mobile app routes
app.use('/api/app', mobileApiLimiter);

// ─── Global admin authentication guard ───────────────────────────────────────
//
// Protects every admin /api/* route with JWT verification.
// Paths listed below are intentionally public and bypass the guard.

const ADMIN_AUTH_SKIP_EXACT = new Set([
	'/api/auth/login', // admin login — issues the token
	'/api/health',     // health check — no sensitive data
]);

// Paths whose requests originate from the mobile app or automated systems,
// which use their own auth mechanisms (OTP tokens / cron secret).
const ADMIN_AUTH_SKIP_PREFIXES = [
	'/api/app/',   // all mobile app routes
	'/api/login/', // compat OTP login
	'/api/signup/',// compat OTP signup
	'/api/cron/',  // cron jobs — protected by x-cron-secret header
];

app.use((req, res, next) => {
	if (!req.path.startsWith('/api/')) return next();
	if (ADMIN_AUTH_SKIP_EXACT.has(req.path)) return next();
	for (const prefix of ADMIN_AUTH_SKIP_PREFIXES) {
		if (req.path.startsWith(prefix)) return next();
	}
	return authenticate(req, res, next);
});

// Connect DB + init models/associations
connectDB();
require('./models');

// Static uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Static legal pages (plain HTML)
const publicDir = path.join(__dirname, 'public');
app.use('/legal', express.static(publicDir));
app.use('/api/legal', express.static(publicDir));
app.use('/public', express.static(publicDir));

// API log (optional)
app.use((req, _res, next) => {
	if (req.path.startsWith('/api/')) console.log('[API]', req.method, req.originalUrl);
	next();
});

// Apple App Site Association — required for iOS Universal Links.
// Set APPLE_TEAM_ID in .env (e.g. AB12CD34EF). Without it this file is
// served with an empty details array and Universal Links won't activate.
app.get('/.well-known/apple-app-site-association', (_req, res) => {
	const teamId = (process.env.APPLE_TEAM_ID || '').trim();
	const bundleId = 'com.rotijugaad.app';
	res.set('Content-Type', 'application/json').json({
		applinks: {
			details: teamId ? [
				{
					appIDs: [`${teamId}.${bundleId}`],
					components: [
						{ '/': '/app/jobs/*',      comment: 'Job detail deep link' },
						{ '/': '/app/candidates/*', comment: 'Candidate detail deep link' },
						{ '/': '/app/referral/*',   comment: 'Referral deep link' },
					],
				},
			] : [],
		},
	});
});

// Android Asset Links — required for Android App Links (HTTPS scheme).
// Set ANDROID_SHA256_CERT in .env (SHA-256 fingerprint from your keystore).
app.get('/.well-known/assetlinks.json', (_req, res) => {
	const sha256 = (process.env.ANDROID_SHA256_CERT || '').trim();
	res.set('Content-Type', 'application/json').json(
		sha256 ? [
			{
				relation: ['delegate_permission/common.handle_all_urls'],
				target: {
					namespace: 'android_app',
					package_name: 'com.rotijugaad.app',
					sha256_cert_fingerprints: [sha256],
				},
			},
		] : []
	);
});

// Routes
app.use('/app', require('./routes/appDeepLinks'));
app.use('/api/app', require('./apis'));
app.use('/api', require('./apis/compat.routes'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/hired-employees', require('./routes/hiredEmployees'));
app.use('/api/admins', require('./routes/admins'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/users', require('./routes/users'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/employers', require('./routes/employers'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/masters/job-profiles', require('./routes/jobProfiles'));
app.use('/api/masters', require('./routes/masters'));
app.use('/api/stories', require('./routes/stories'));
app.use('/api/call-history', require('./routes/callHistory'));
app.use('/api/contact-unlocks', require('./routes/contactUnlocks'));
app.use('/api/payment-history', require('./routes/paymentHistory'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/translate', require('./routes/translate'));
app.use('/api/cron', require('./routes/cron'));

// Public invoice route — no auth required, accessible from emailed/SMS invoice links
app.use('/invoice', require('./routes/publicInvoice'));

// Health
app.get('/api/health', (_req, res) => res.json({ success: true, message: 'Server is running' }));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
