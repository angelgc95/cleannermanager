CREATE OR REPLACE FUNCTION public.push_in_app_notification(
  _user_id uuid,
  _host_user_id uuid,
  _title text,
  _body text,
  _link text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.in_app_notifications (user_id, host_user_id, title, body, link)
  VALUES (_user_id, _host_user_id, _title, _body, _link);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_new_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.push_in_app_notification(
    NEW.assigned_cleaner_id,
    NEW.host_user_id,
    'A new task has been added',
    COALESCE(NEW.label, 'A new task is waiting on your dashboard.'),
    '/'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_task_assignment ON public.tasks;
CREATE TRIGGER trg_notify_new_task_assignment
AFTER INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_task_assignment();

CREATE OR REPLACE FUNCTION public.notify_checklist_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_host_user_id uuid;
  v_cleaner_name text;
  v_listing_name text;
  v_event_id uuid;
BEGIN
  IF NEW.finished_at IS NULL OR OLD.finished_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    ce.host_user_id,
    ce.id,
    COALESCE(p.name, 'Cleaner'),
    COALESCE(l.name, 'Listing')
  INTO v_host_user_id, v_event_id, v_cleaner_name, v_listing_name
  FROM public.cleaning_events ce
  LEFT JOIN public.profiles p ON p.user_id = NEW.cleaner_user_id
  LEFT JOIN public.listings l ON l.id = ce.listing_id
  WHERE ce.id = NEW.cleaning_event_id;

  PERFORM public.push_in_app_notification(
    v_host_user_id,
    v_host_user_id,
    'Checklist completed',
    v_cleaner_name || ' completed the checklist for ' || v_listing_name || '.',
    CASE WHEN v_event_id IS NOT NULL THEN '/events/' || v_event_id::text ELSE '/tasks' END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_checklist_completion ON public.checklist_runs;
CREATE TRIGGER trg_notify_checklist_completion
AFTER UPDATE OF finished_at ON public.checklist_runs
FOR EACH ROW
EXECUTE FUNCTION public.notify_checklist_completion();

CREATE OR REPLACE FUNCTION public.notify_new_maintenance_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_creator_name text;
  v_listing_name text;
BEGIN
  IF NEW.created_by_user_id = NEW.host_user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, 'Cleaner') INTO v_creator_name
  FROM public.profiles
  WHERE user_id = NEW.created_by_user_id;

  SELECT COALESCE(name, 'Listing') INTO v_listing_name
  FROM public.listings
  WHERE id = NEW.listing_id;

  PERFORM public.push_in_app_notification(
    NEW.host_user_id,
    NEW.host_user_id,
    'There is a new maintenance report',
    trim(both ' ' from concat(v_creator_name, ' reported an issue', CASE WHEN v_listing_name IS NOT NULL THEN ' for ' || v_listing_name ELSE '' END, '.')),
    '/maintenance'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_maintenance_report ON public.maintenance_tickets;
CREATE TRIGGER trg_notify_new_maintenance_report
AFTER INSERT ON public.maintenance_tickets
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_maintenance_report();

CREATE OR REPLACE FUNCTION public.notify_shopping_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_creator_name text;
  v_body text;
BEGIN
  IF NEW.created_by_user_id = NEW.host_user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, 'Cleaner') INTO v_creator_name
  FROM public.profiles
  WHERE user_id = NEW.created_by_user_id;

  v_body := v_creator_name || ' submitted a shopping list.';
  IF NEW.notes IS NOT NULL AND btrim(NEW.notes) <> '' THEN
    v_body := v_body || ' ' || NEW.notes;
  END IF;

  PERFORM public.push_in_app_notification(
    NEW.host_user_id,
    NEW.host_user_id,
    'Items missing',
    v_body,
    '/shopping'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_shopping_submission ON public.shopping_submissions;
CREATE TRIGGER trg_notify_shopping_submission
AFTER INSERT ON public.shopping_submissions
FOR EACH ROW
EXECUTE FUNCTION public.notify_shopping_submission();

CREATE OR REPLACE FUNCTION public.notify_payout_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cleaner_name text;
  v_period_label text;
  v_amount text;
  v_cleaner_body text;
  v_host_body text;
  v_status_changed boolean;
BEGIN
  v_status_changed := TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status;
  IF NOT v_status_changed THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, 'Cleaner') INTO v_cleaner_name
  FROM public.profiles
  WHERE user_id = NEW.cleaner_user_id;

  SELECT to_char(start_date, 'Mon DD') || ' - ' || to_char(end_date, 'Mon DD')
  INTO v_period_label
  FROM public.payout_periods
  WHERE id = NEW.period_id;

  v_amount := 'EUR ' || COALESCE(to_char(NEW.total_amount, 'FM999999990.00'), '0.00');
  v_cleaner_body := trim(both ' ' from concat(v_amount, CASE WHEN v_period_label IS NOT NULL THEN ' · ' || v_period_label ELSE '' END));
  v_host_body := trim(both ' ' from concat(v_cleaner_name, ' · ', v_amount, CASE WHEN v_period_label IS NOT NULL THEN ' · ' || v_period_label ELSE '' END));

  IF NEW.status = 'PENDING' THEN
    PERFORM public.push_in_app_notification(
      NEW.cleaner_user_id,
      NEW.host_user_id,
      'Your weekly payment is ready',
      v_cleaner_body,
      '/payouts'
    );

    PERFORM public.push_in_app_notification(
      NEW.host_user_id,
      NEW.host_user_id,
      'Weekly payment is pending',
      v_host_body,
      '/payouts'
    );
  ELSIF NEW.status = 'PAID' THEN
    PERFORM public.push_in_app_notification(
      NEW.cleaner_user_id,
      NEW.host_user_id,
      'Your payment has been paid',
      v_cleaner_body,
      '/payouts'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payout_status_change ON public.payouts;
CREATE TRIGGER trg_notify_payout_status_change
AFTER INSERT OR UPDATE OF status ON public.payouts
FOR EACH ROW
EXECUTE FUNCTION public.notify_payout_status_change();

CREATE OR REPLACE FUNCTION public.manage_notification_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event RECORD;
  v_user_id uuid;
  v_scheduled_12h timestamptz;
  v_scheduled_1h timestamptz;
  v_scheduled_3pm timestamptz;
  v_listing_tz text;
  v_event_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.notification_jobs
    SET status = 'SKIPPED'
    WHERE cleaning_event_id = OLD.id
      AND status = 'SCHEDULED';
    RETURN OLD;
  END IF;

  v_event := NEW;

  IF v_event.status IN ('DONE', 'CANCELLED') THEN
    UPDATE public.notification_jobs
    SET status = 'SKIPPED'
    WHERE cleaning_event_id = v_event.id
      AND status = 'SCHEDULED';
    RETURN NEW;
  END IF;

  IF v_event.assigned_cleaner_id IS NULL OR v_event.start_at IS NULL THEN
    RETURN NEW;
  END IF;

  v_user_id := v_event.assigned_cleaner_id;
  SELECT COALESCE(timezone, 'Europe/London') INTO v_listing_tz
  FROM public.listings
  WHERE id = v_event.listing_id;

  v_scheduled_12h := v_event.start_at - INTERVAL '12 hours';
  v_scheduled_1h := v_event.start_at - INTERVAL '1 hour';
  v_event_date := (v_event.start_at AT TIME ZONE COALESCE(v_listing_tz, 'UTC'))::date;
  v_scheduled_3pm := (v_event_date || ' 15:00:00')::timestamp AT TIME ZONE COALESCE(v_listing_tz, 'UTC');

  IF v_scheduled_12h > now() THEN
    INSERT INTO public.notification_jobs (cleaning_event_id, user_id, host_user_id, type, scheduled_for, status)
    VALUES (v_event.id, v_user_id, v_event.host_user_id, 'REMINDER_12H', v_scheduled_12h, 'SCHEDULED')
    ON CONFLICT (cleaning_event_id, user_id, type) DO UPDATE
      SET scheduled_for = EXCLUDED.scheduled_for,
          status = 'SCHEDULED'
    WHERE notification_jobs.status = 'SCHEDULED';
  END IF;

  IF v_scheduled_1h > now() THEN
    INSERT INTO public.notification_jobs (cleaning_event_id, user_id, host_user_id, type, scheduled_for, status)
    VALUES (v_event.id, v_user_id, v_event.host_user_id, 'REMINDER_1H', v_scheduled_1h, 'SCHEDULED')
    ON CONFLICT (cleaning_event_id, user_id, type) DO UPDATE
      SET scheduled_for = EXCLUDED.scheduled_for,
          status = 'SCHEDULED'
    WHERE notification_jobs.status = 'SCHEDULED';
  END IF;

  IF v_scheduled_3pm > now() THEN
    INSERT INTO public.notification_jobs (cleaning_event_id, user_id, host_user_id, type, scheduled_for, status)
    VALUES (v_event.id, v_user_id, v_event.host_user_id, 'CHECKLIST_2PM', v_scheduled_3pm, 'SCHEDULED')
    ON CONFLICT (cleaning_event_id, user_id, type) DO UPDATE
      SET scheduled_for = EXCLUDED.scheduled_for,
          status = 'SCHEDULED'
    WHERE notification_jobs.status = 'SCHEDULED';
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.notification_jobs nj
SET scheduled_for = ((ce.start_at AT TIME ZONE COALESCE(l.timezone, 'UTC'))::date || ' 15:00:00')::timestamp AT TIME ZONE COALESCE(l.timezone, 'UTC')
FROM public.cleaning_events ce
JOIN public.listings l ON l.id = ce.listing_id
WHERE nj.cleaning_event_id = ce.id
  AND nj.type = 'CHECKLIST_2PM'
  AND nj.status = 'SCHEDULED';
