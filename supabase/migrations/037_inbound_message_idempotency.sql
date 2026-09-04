-- 037_inbound_message_idempotency.sql
--
-- WhatsApp idempotency (production-readiness pass).
--
-- Meta retries webhook deliveries that aren't acked quickly enough.
-- The webhook route inserts the inbound message with
-- `messages.message_id = <Meta wamid>` and — on insert error — returns
-- BEFORE usage metering, automations, flows, and AI dispatch. But the
-- index on message_id (001) was never UNIQUE, so a redelivered event
-- inserted a SECOND message row and re-ran the whole downstream chain
-- (duplicate usage increments, duplicate automation executions,
-- duplicate AI replies).
--
-- Meta IDs are only unique per phone number (see migration 009), so
-- uniqueness is scoped to (conversation_id, message_id): a redelivery
-- of the same event always resolves to the same conversation, while
-- two different numbers can never collide.
--
-- If this migration fails on a database that already has duplicate
-- (conversation_id, message_id) pairs, clean them up first:
--
--   DELETE FROM messages a USING messages b
--   WHERE a.conversation_id = b.conversation_id
--     AND a.message_id = b.message_id
--     AND a.message_id IS NOT NULL
--     AND a.created_at > b.created_at;
--
-- then re-run this migration.

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_message_id_unique
  ON messages (conversation_id, message_id)
  WHERE message_id IS NOT NULL;
