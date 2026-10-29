-- Keep-warm, light: one small request every 5 minutes instead of 27 full screens every 4.
-- The old job, with GitHub's, used up the hosting plan's server time and Vercel paused the site.
-- /api/version?warm=1 keeps one server awake with billing and save code loaded, rendering no screen.

select cron.unschedule(jobid) from cron.job where jobname = 'the-ray-keep-warm';

select cron.schedule(
  'the-ray-keep-warm',
  '*/5 * * * *',
  $$ select net.http_get(url := 'https://bill.theray.in/api/version?warm=1', timeout_milliseconds := 20000); $$
);
