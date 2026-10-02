-- Keeps The Ray's servers warm from the database itself, every 4 minutes, all day.
--
-- A screen nobody has opened for a while starts its server from cold: Speed watch showed a shop's
-- app opening in 6.6 s, 4.5 s of it the server waking. GitHub's scheduled keep-warm job was meant
-- to stop that, but GitHub runs schedules when it likes (once in five hours here), so the database
-- does it instead with pg_cron and pg_net, both available on every Supabase plan.
--
-- Each request is unauthenticated and stops at the login check: enough to keep the server awake,
-- nothing else runs. Safe to run again; it replaces the job.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'the-ray-keep-warm';

select cron.schedule(
  'the-ray-keep-warm',
  '*/4 * * * *',
  $$
  select net.http_get(url := 'https://bill.theray.in' || path, timeout_milliseconds := 20000)
  from unnest(array[
    '/', '/login', '/dashboard', '/bills/new', '/fast-billing', '/bills', '/customers', '/products',
    '/purchases', '/reports', '/more', '/help', '/daily-summary', '/reminders', '/restaurant',
    '/restaurant-kds', '/hotel', '/videos', '/api/version', '/api/customers/search', '/api/customers/all',
    '/admin', '/admin/login', '/admin/support', '/admin/enquiries', '/admin/videos', '/admin/speed'
  ]) as path;
  $$
);

-- To check it is running:   select * from cron.job_run_details order by start_time desc limit 5;
-- To stop it:               select cron.unschedule('the-ray-keep-warm');
