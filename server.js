const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const path = require('path'); // added
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to database
connectDB();

// Initialize models and associations
require('./models'); // ensure Employer registered

// Serve uploaded images.
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'))); // added

// Routes
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log('[API]', req.method, req.originalUrl);
  }
  next();
});

// IMPORTANT: mount specific job-profiles route BEFORE generic /api/masters
app.use('/api/masters/job-profiles', require('./routes/jobProfiles')); // moved up

app.use('/api/auth', require('./routes/auth'));
app.use('/api/hired-employees', require('./routes/hiredEmployees'));
app.use('/api/admins', require('./routes/admins'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/users', require('./routes/users'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/employers', require('./routes/employers')); // added
app.use('/api/dashboard', require('./routes/dashboard')); // added
app.use('/api/settings', require('./routes/settings')); // added
app.use('/api/reports', require('./routes/reports')); // added
app.use('/api/masters', require('./routes/masters')); // generic masters last
app.use('/api/stories', require('./routes/stories')); // generic masters last
app.use('/api/call-history', require('./routes/callHistory')); // ensure present
app.use('/api/payment-history', require('./routes/paymentHistory')); // added
app.use('/api/jobs', require('./routes/jobs')); // added
app.use('/api/notifications', require('./routes/notifications')); // register notifications endpoints
app.use('/api/referrals', require('./routes/referrals')); // new referrals endpoints
app.use('/api/reviews', require('./routes/reviews')); // new reviews endpoints
app.use('/api/translate', require('./routes/translate')); // expose translate proxy

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// MIGRATION COMMANDS:
//   cd backend
//   npm i -D sequelize-cli
//   npx sequelize-cli db:migrate            # apply pending
//   npx sequelize-cli db:migrate:undo       # undo last
//   npx sequelize-cli db:migrate:undo:all   # undo all
//   npx sequelize-cli db:migrate            # reapply
// OPTIONAL HTTP TRIGGER (set MIGRATIONS_ENABLE=true and MIGRATIONS_KEY):
//   curl -X POST -H "X-Migrate-Key: $MIGRATIONS_KEY" http://localhost:5001/api/admin/run-migrations

const { exec } = require('child_process'); // added
app.post('/api/admin/run-migrations', (req, res) => { // added
  if (process.env.MIGRATIONS_ENABLE !== 'true') {
    return res.status(403).json({ success: false, message: 'Disabled' });
  }
  if (req.headers['x-migrate-key'] !== process.env.MIGRATIONS_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  exec('npx sequelize-cli db:migrate', { cwd: process.cwd() + '/backend' }, (err, stdout, stderr) => {
    if (err) {
      console.error('[migrate] error:', err);
      return res.status(500).json({ success: false, message: err.message, stderr });
    }
    res.json({ success: true, stdout, stderr });
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
