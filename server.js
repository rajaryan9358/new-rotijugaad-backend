const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { connectDB } = require('./config/db');

const app = express();

app.use(cors());
app.use(express.json());

// Connect DB + init models/associations
connectDB();
require('./models');

// Static uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// API log (optional)
app.use((req, _res, next) => {
	if (req.path.startsWith('/api/')) console.log('[API]', req.method, req.originalUrl);
	next();
});

// Routes
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
app.use('/api/payment-history', require('./routes/paymentHistory'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/translate', require('./routes/translate'));

// Health
app.get('/api/health', (_req, res) => res.json({ success: true, message: 'Server is running' }));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
