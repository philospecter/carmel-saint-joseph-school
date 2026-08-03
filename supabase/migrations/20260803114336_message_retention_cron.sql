create extension if not exists pg_cron with schema extensions;

-- Messages older than 60 days are purged to save storage. The conversation
-- thread itself is kept (so the chat still exists and new messages can be
-- sent) -- only the message history rolls off.
select cron.schedule(
  'purge-old-messages',
  '0 4 * * *',
  $$delete from public.messages where created_at < now() - interval '60 days'$$
);
