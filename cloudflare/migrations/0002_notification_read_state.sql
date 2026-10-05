ALTER TABLE notifications ADD COLUMN read_at TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read
  ON notifications (recipient_type, read_at);