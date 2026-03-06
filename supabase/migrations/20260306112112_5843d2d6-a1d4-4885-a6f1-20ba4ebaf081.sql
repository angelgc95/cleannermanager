-- cleaning_events
CREATE INDEX IF NOT EXISTS idx_cleaning_events_host_start ON cleaning_events(host_user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_cleaning_events_cleaner_start ON cleaning_events(assigned_cleaner_id, start_at);
CREATE INDEX IF NOT EXISTS idx_cleaning_events_listing_status ON cleaning_events(listing_id, status);

-- notification_jobs (partial index for dispatcher)
CREATE INDEX IF NOT EXISTS idx_notification_jobs_scheduled ON notification_jobs(status, scheduled_for)
  WHERE status = 'SCHEDULED';

-- in_app_notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON in_app_notifications(user_id, created_at DESC);

-- log_hours
CREATE INDEX IF NOT EXISTS idx_log_hours_host_user_date ON log_hours(host_user_id, user_id, date);
CREATE INDEX IF NOT EXISTS idx_log_hours_payout ON log_hours(payout_id);

-- shopping_list
CREATE INDEX IF NOT EXISTS idx_shopping_list_host_status ON shopping_list(host_user_id, status, created_at);

-- cleaner_assignments
CREATE INDEX IF NOT EXISTS idx_cleaner_assignments_host_cleaner ON cleaner_assignments(host_user_id, cleaner_user_id);

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_host_created ON tasks(host_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_cleaner_status ON tasks(assigned_cleaner_id, status, created_at DESC);