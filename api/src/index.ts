import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { login, logout, me, requireSession, requestPasswordSet, setPasswordWithToken } from './auth';
import sessionRoutes from './routes/sessions';
import roomRoutes from './routes/rooms';
import peopleRoutes from './routes/people';
import calendarRoutes from './routes/calendar';
import enrolmentRoutes from './routes/enrolments';
import assistantRoutes from './routes/assistant';
import { startScheduler } from './jobs/scheduler';

const app = express();

app.use(
  cors({
    origin: process.env.WEB_BASE_URL || 'http://localhost:3000',
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

app.post('/api/login', login);
app.post('/api/logout', logout);
app.get('/api/me', requireSession, me);

app.post('/api/request-password-set', async (req, res) => {
  try {
    await requestPasswordSet(req.body?.email || '');
    // Always 200 regardless of whether the email exists — no account enumeration.
    res.json({ requested: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not process that request' });
  }
});
app.post('/api/set-password', setPasswordWithToken);

app.use('/api/sessions', sessionRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/enrolments', enrolmentRoutes);
app.use('/api/assistant', assistantRoutes);

const port = Number(process.env.API_PORT) || 4000;

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
  // Fires once immediately to compute the next local-midnight instant,
  // then reschedules itself — see jobs/scheduler.ts for why this isn't
  // a fixed cron("0 0 * * *") anchored to a UTC hour.
  startScheduler();
});