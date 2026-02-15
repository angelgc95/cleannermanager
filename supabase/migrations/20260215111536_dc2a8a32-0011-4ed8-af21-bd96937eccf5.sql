
-- Notification types enum
CREATE TYPE public.notification_type AS ENUM ('REMINDER_12H', 'REMINDER_1H', 'CHECKLIST_2PM');
CREATE TYPE public.notification_job_status AS ENUM ('SCHEDULED', 'SENT', 'SKIPPED', 'FAILED');

-- Notification Preferences (per user)
CREATE TABLE public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT false,
  inapp_enabled BOOLEAN DEFAULT true,
  reminders_12h_enabled BOOLEAN DEFAULT true,
  reminders_1h_enabled BOOLEAN DEFAULT true,
  checklist_2pm_enabled BOOLEAN DEFAULT true,
  manager_cc_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences" ON public.notification_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON public.notification_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Auto-create notification preferences on profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email);
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

-- Notification Jobs
CREATE TABLE public.notification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaning_task_id UUID REFERENCES public.cleaning_tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type notification_type NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status notification_job_status DEFAULT 'SCHEDULED',
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cleaning_task_id, user_id, type)
);
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification jobs" ON public.notification_jobs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all notification jobs" ON public.notification_jobs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "System can manage notification jobs" ON public.notification_jobs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Indexes for cron query performance
CREATE INDEX idx_notification_jobs_scheduled ON public.notification_jobs (status, scheduled_for) WHERE status = 'SCHEDULED';
CREATE INDEX idx_notification_jobs_task ON public.notification_jobs (cleaning_task_id);

-- Trigger for updated_at
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_notification_jobs_updated_at BEFORE UPDATE ON public.notification_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- In-app notifications table for the bell icon
CREATE TABLE public.in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN DEFAULT false,
  notification_job_id UUID REFERENCES public.notification_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own in-app notifications" ON public.in_app_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own in-app notifications" ON public.in_app_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "System can insert in-app notifications" ON public.in_app_notifications
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_in_app_notifications_user ON public.in_app_notifications (user_id, read, created_at DESC);

-- Function to create/update notification jobs when a cleaning task changes
CREATE OR REPLACE FUNCTION public.manage_notification_jobs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_user_id UUID;
  v_scheduled_12h TIMESTAMPTZ;
  v_scheduled_1h TIMESTAMPTZ;
  v_scheduled_2pm TIMESTAMPTZ;
  v_property_tz TEXT;
  v_task_date DATE;
BEGIN
  -- Use NEW for INSERT/UPDATE, OLD for DELETE
  IF TG_OP = 'DELETE' THEN
    -- Cancel all scheduled jobs for deleted task
    UPDATE public.notification_jobs
    SET status = 'SKIPPED'
    WHERE cleaning_task_id = OLD.id AND status = 'SCHEDULED';
    RETURN OLD;
  END IF;

  v_task := NEW;

  -- If task is DONE or CANCELLED, skip all pending jobs
  IF v_task.status IN ('DONE', 'CANCELLED') THEN
    UPDATE public.notification_jobs
    SET status = 'SKIPPED'
    WHERE cleaning_task_id = v_task.id AND status = 'SCHEDULED';
    RETURN NEW;
  END IF;

  -- Need an assigned cleaner and start_at
  IF v_task.assigned_cleaner_user_id IS NULL OR v_task.start_at IS NULL THEN
    RETURN NEW;
  END IF;

  v_user_id := v_task.assigned_cleaner_user_id;

  -- Get property timezone
  SELECT COALESCE(timezone, 'Europe/London') INTO v_property_tz
  FROM public.properties WHERE id = v_task.property_id;

  -- Calculate scheduled times
  v_scheduled_12h := v_task.start_at - INTERVAL '12 hours';
  v_scheduled_1h := v_task.start_at - INTERVAL '1 hour';

  -- 2pm check: task day at 14:00 in property timezone
  v_task_date := (v_task.start_at AT TIME ZONE COALESCE(v_property_tz, 'UTC'))::DATE;
  v_scheduled_2pm := (v_task_date || ' 14:00:00')::TIMESTAMP AT TIME ZONE COALESCE(v_property_tz, 'UTC');

  -- Upsert 12h reminder (skip if already past)
  IF v_scheduled_12h > now() THEN
    INSERT INTO public.notification_jobs (cleaning_task_id, user_id, type, scheduled_for, status)
    VALUES (v_task.id, v_user_id, 'REMINDER_12H', v_scheduled_12h, 'SCHEDULED')
    ON CONFLICT (cleaning_task_id, user_id, type)
    DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for, status = 'SCHEDULED'
    WHERE notification_jobs.status = 'SCHEDULED';
  END IF;

  -- Upsert 1h reminder
  IF v_scheduled_1h > now() THEN
    INSERT INTO public.notification_jobs (cleaning_task_id, user_id, type, scheduled_for, status)
    VALUES (v_task.id, v_user_id, 'REMINDER_1H', v_scheduled_1h, 'SCHEDULED')
    ON CONFLICT (cleaning_task_id, user_id, type)
    DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for, status = 'SCHEDULED'
    WHERE notification_jobs.status = 'SCHEDULED';
  END IF;

  -- Upsert 2pm checklist compliance
  IF v_scheduled_2pm > now() THEN
    INSERT INTO public.notification_jobs (cleaning_task_id, user_id, type, scheduled_for, status)
    VALUES (v_task.id, v_user_id, 'CHECKLIST_2PM', v_scheduled_2pm, 'SCHEDULED')
    ON CONFLICT (cleaning_task_id, user_id, type)
    DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for, status = 'SCHEDULED'
    WHERE notification_jobs.status = 'SCHEDULED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_manage_notification_jobs
  AFTER INSERT OR UPDATE OF start_at, end_at, status, assigned_cleaner_user_id, locked
  ON public.cleaning_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.manage_notification_jobs();

-- Also handle delete
CREATE TRIGGER trg_manage_notification_jobs_delete
  AFTER DELETE ON public.cleaning_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.manage_notification_jobs();

-- Enable realtime for in-app notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;
