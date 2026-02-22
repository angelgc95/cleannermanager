
-- ============================================
-- CLEAN REBUILD: Host/Cleaner model (no orgs, no rooms, no properties)
-- ============================================

-- 1. Drop all tables
DROP TABLE IF EXISTS public.shopping_list CASCADE;
DROP TABLE IF EXISTS public.shopping_submissions CASCADE;
DROP TABLE IF EXISTS public.checklist_photos CASCADE;
DROP TABLE IF EXISTS public.checklist_responses CASCADE;
DROP TABLE IF EXISTS public.checklist_runs CASCADE;
DROP TABLE IF EXISTS public.checklist_items CASCADE;
DROP TABLE IF EXISTS public.checklist_sections CASCADE;
DROP TABLE IF EXISTS public.checklist_templates CASCADE;
DROP TABLE IF EXISTS public.notification_jobs CASCADE;
DROP TABLE IF EXISTS public.in_app_notifications CASCADE;
DROP TABLE IF EXISTS public.notification_preferences CASCADE;
DROP TABLE IF EXISTS public.maintenance_updates CASCADE;
DROP TABLE IF EXISTS public.maintenance_tickets CASCADE;
DROP TABLE IF EXISTS public.log_hours CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.payouts CASCADE;
DROP TABLE IF EXISTS public.payout_periods CASCADE;
DROP TABLE IF EXISTS public.cleaning_tasks CASCADE;
DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.cleaner_assignments CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.guides CASCADE;
DROP TABLE IF EXISTS public.guides_folders CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.properties CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;
DROP TABLE IF EXISTS public.host_settings CASCADE;
DROP TABLE IF EXISTS public.listings CASCADE;

-- 2. Drop old functions
DROP FUNCTION IF EXISTS public.has_role CASCADE;
DROP FUNCTION IF EXISTS public.get_user_org_id CASCADE;
DROP FUNCTION IF EXISTS public.generate_unique_code CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column CASCADE;
DROP FUNCTION IF EXISTS public.manage_notification_jobs CASCADE;
DROP FUNCTION IF EXISTS public.cleaner_has_listing_access CASCADE;
DROP FUNCTION IF EXISTS public.cleaner_is_assigned_to_host CASCADE;

-- 3. Drop old enums that need changing
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.cleaning_mode CASCADE;

-- 4. Create new enum
CREATE TYPE public.app_role AS ENUM ('host', 'cleaner');

-- 5. Create tables (no cross-FKs yet)

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  email text,
  unique_code text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.host_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL UNIQUE,
  payout_frequency text NOT NULL DEFAULT 'WEEKLY',
  payout_week_end_day integer NOT NULL DEFAULT 0,
  default_hourly_rate numeric NOT NULL DEFAULT 15,
  timezone text NOT NULL DEFAULT 'Europe/London',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.host_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL,
  name text NOT NULL,
  default_checkin_time time DEFAULT '15:00',
  default_checkout_time time DEFAULT '11:00',
  ics_url_airbnb text,
  ics_url_booking text,
  ics_url_other text,
  sync_enabled boolean DEFAULT false,
  last_synced_at timestamptz,
  timezone text DEFAULT 'Europe/London',
  currency text DEFAULT 'EUR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cleaner_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_user_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  host_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cleaner_user_id, listing_id)
);
ALTER TABLE public.cleaner_assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  host_user_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  external_uid text UNIQUE,
  source_platform text,
  guests_count integer,
  nights integer,
  checkin_at timestamptz,
  checkout_at timestamptz,
  raw_ics_payload text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cleaning_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  host_user_id uuid NOT NULL,
  assigned_cleaner_user_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status cleaning_status DEFAULT 'TODO',
  source cleaning_source DEFAULT 'MANUAL',
  notes text,
  nights_to_show integer,
  guests_to_show integer,
  previous_booking_id uuid REFERENCES public.bookings(id),
  next_booking_id uuid REFERENCES public.bookings(id),
  checklist_run_id uuid,
  locked boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cleaning_tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL,
  name text NOT NULL,
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.checklist_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  host_user_id uuid,
  title text NOT NULL,
  sort_order integer DEFAULT 0
);
ALTER TABLE public.checklist_sections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.checklist_sections(id) ON DELETE CASCADE,
  host_user_id uuid,
  label text NOT NULL,
  help_text text,
  type checklist_item_type DEFAULT 'YESNO',
  sort_order integer DEFAULT 0,
  required boolean DEFAULT true,
  item_key text
);
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.checklist_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaning_task_id uuid UNIQUE REFERENCES public.cleaning_tasks(id),
  cleaner_user_id uuid NOT NULL,
  host_user_id uuid NOT NULL,
  listing_id uuid REFERENCES public.listings(id),
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  duration_minutes integer,
  overall_notes text,
  payout_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.checklist_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.checklist_runs(id),
  item_id uuid NOT NULL REFERENCES public.checklist_items(id),
  host_user_id uuid,
  yesno_value boolean,
  text_value text,
  number_value numeric,
  photo_url text
);
ALTER TABLE public.checklist_responses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.checklist_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.checklist_runs(id),
  item_id uuid NOT NULL REFERENCES public.checklist_items(id),
  host_user_id uuid,
  photo_url text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_photos ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  inapp_enabled boolean DEFAULT true,
  push_enabled boolean DEFAULT false,
  email_enabled boolean DEFAULT true,
  reminders_12h_enabled boolean DEFAULT true,
  reminders_1h_enabled boolean DEFAULT true,
  checklist_2pm_enabled boolean DEFAULT true,
  manager_cc_enabled boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaning_task_id uuid NOT NULL REFERENCES public.cleaning_tasks(id),
  user_id uuid NOT NULL,
  host_user_id uuid,
  type notification_type NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status notification_job_status DEFAULT 'SCHEDULED',
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cleaning_task_id, user_id, type)
);
ALTER TABLE public.notification_jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  host_user_id uuid,
  title text NOT NULL,
  body text,
  link text,
  read boolean DEFAULT false,
  notification_job_id uuid REFERENCES public.notification_jobs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.log_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  host_user_id uuid NOT NULL,
  listing_id uuid REFERENCES public.listings(id),
  cleaning_task_id uuid REFERENCES public.cleaning_tasks(id),
  checklist_run_id uuid UNIQUE REFERENCES public.checklist_runs(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  start_at time NOT NULL,
  end_at time NOT NULL,
  duration_minutes integer,
  description text,
  source log_hours_source DEFAULT 'MANUAL',
  payout_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.log_hours ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id uuid NOT NULL,
  host_user_id uuid NOT NULL,
  listing_id uuid REFERENCES public.listings(id),
  name text NOT NULL,
  amount numeric NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  shop text,
  receipt_photo_url text,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.maintenance_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id uuid NOT NULL,
  host_user_id uuid NOT NULL,
  listing_id uuid REFERENCES public.listings(id),
  issue text NOT NULL,
  status maintenance_status DEFAULT 'OPEN',
  pic1_url text,
  pic2_url text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.maintenance_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL,
  host_user_id uuid,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.maintenance_updates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL,
  name text NOT NULL,
  category text,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.shopping_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id uuid NOT NULL,
  host_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shopping_submissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.shopping_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  created_by_user_id uuid NOT NULL,
  host_user_id uuid NOT NULL,
  listing_id uuid REFERENCES public.listings(id),
  submission_id uuid REFERENCES public.shopping_submissions(id) ON DELETE CASCADE,
  checklist_run_id uuid REFERENCES public.checklist_runs(id),
  status shopping_status DEFAULT 'MISSING',
  quantity_needed integer DEFAULT 1,
  note text,
  created_from shopping_created_from DEFAULT 'MANUAL',
  cleared_by_user_id uuid,
  last_cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shopping_list ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payout_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status payout_period_status DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payout_periods ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.payout_periods(id),
  cleaner_user_id uuid NOT NULL,
  host_user_id uuid NOT NULL,
  total_minutes integer DEFAULT 0,
  hourly_rate_used numeric NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  status payout_status DEFAULT 'PENDING',
  paid_at timestamptz,
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.guides_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guides_folders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL,
  folder_id uuid NOT NULL REFERENCES public.guides_folders(id) ON DELETE CASCADE,
  title text NOT NULL,
  pdf_url text,
  uploaded_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;

-- Add deferred cross-reference FKs
ALTER TABLE public.checklist_runs ADD CONSTRAINT checklist_runs_payout_fk FOREIGN KEY (payout_id) REFERENCES public.payouts(id);
ALTER TABLE public.log_hours ADD CONSTRAINT log_hours_payout_fk FOREIGN KEY (payout_id) REFERENCES public.payouts(id);
ALTER TABLE public.cleaning_tasks ADD CONSTRAINT cleaning_tasks_run_fk FOREIGN KEY (checklist_run_id) REFERENCES public.checklist_runs(id);

-- 6. Create helper functions

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.cleaner_has_listing_access(_cleaner_id uuid, _listing_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cleaner_assignments WHERE cleaner_user_id = _cleaner_id AND listing_id = _listing_id)
$$;

CREATE OR REPLACE FUNCTION public.cleaner_is_assigned_to_host(_cleaner_id uuid, _host_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cleaner_assignments WHERE cleaner_user_id = _cleaner_id AND host_user_id = _host_id)
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.generate_unique_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_code TEXT; code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0') || CHR(65 + FLOOR(RANDOM() * 26)::INT);
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE unique_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  NEW.unique_code := new_code;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email);
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

-- 7. Create triggers

CREATE TRIGGER set_unique_code BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.generate_unique_code();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cleaning_tasks_updated_at BEFORE UPDATE ON public.cleaning_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_maintenance_tickets_updated_at BEFORE UPDATE ON public.maintenance_tickets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notification jobs trigger
CREATE OR REPLACE FUNCTION public.manage_notification_jobs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_task RECORD; v_user_id UUID; v_scheduled_12h TIMESTAMPTZ; v_scheduled_1h TIMESTAMPTZ;
  v_scheduled_2pm TIMESTAMPTZ; v_listing_tz TEXT; v_task_date DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.notification_jobs SET status = 'SKIPPED' WHERE cleaning_task_id = OLD.id AND status = 'SCHEDULED';
    RETURN OLD;
  END IF;
  v_task := NEW;
  IF v_task.status IN ('DONE', 'CANCELLED') THEN
    UPDATE public.notification_jobs SET status = 'SKIPPED' WHERE cleaning_task_id = v_task.id AND status = 'SCHEDULED';
    RETURN NEW;
  END IF;
  IF v_task.assigned_cleaner_user_id IS NULL OR v_task.start_at IS NULL THEN RETURN NEW; END IF;
  v_user_id := v_task.assigned_cleaner_user_id;
  SELECT COALESCE(timezone, 'Europe/London') INTO v_listing_tz FROM public.listings WHERE id = v_task.listing_id;
  v_scheduled_12h := v_task.start_at - INTERVAL '12 hours';
  v_scheduled_1h := v_task.start_at - INTERVAL '1 hour';
  v_task_date := (v_task.start_at AT TIME ZONE COALESCE(v_listing_tz, 'UTC'))::DATE;
  v_scheduled_2pm := (v_task_date || ' 14:00:00')::TIMESTAMP AT TIME ZONE COALESCE(v_listing_tz, 'UTC');
  IF v_scheduled_12h > now() THEN
    INSERT INTO public.notification_jobs (cleaning_task_id, user_id, host_user_id, type, scheduled_for, status)
    VALUES (v_task.id, v_user_id, v_task.host_user_id, 'REMINDER_12H', v_scheduled_12h, 'SCHEDULED')
    ON CONFLICT (cleaning_task_id, user_id, type) DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for, status = 'SCHEDULED'
    WHERE notification_jobs.status = 'SCHEDULED';
  END IF;
  IF v_scheduled_1h > now() THEN
    INSERT INTO public.notification_jobs (cleaning_task_id, user_id, host_user_id, type, scheduled_for, status)
    VALUES (v_task.id, v_user_id, v_task.host_user_id, 'REMINDER_1H', v_scheduled_1h, 'SCHEDULED')
    ON CONFLICT (cleaning_task_id, user_id, type) DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for, status = 'SCHEDULED'
    WHERE notification_jobs.status = 'SCHEDULED';
  END IF;
  IF v_scheduled_2pm > now() THEN
    INSERT INTO public.notification_jobs (cleaning_task_id, user_id, host_user_id, type, scheduled_for, status)
    VALUES (v_task.id, v_user_id, v_task.host_user_id, 'CHECKLIST_2PM', v_scheduled_2pm, 'SCHEDULED')
    ON CONFLICT (cleaning_task_id, user_id, type) DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for, status = 'SCHEDULED'
    WHERE notification_jobs.status = 'SCHEDULED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER manage_notification_jobs_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.cleaning_tasks
FOR EACH ROW EXECUTE FUNCTION public.manage_notification_jobs();

-- 8. RLS Policies

-- profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Host can view all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'host'::app_role));
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (user_id = auth.uid());

-- user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Host can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'host'::app_role));

-- host_settings
CREATE POLICY "Host can manage own settings" ON public.host_settings FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaners can view host settings" ON public.host_settings FOR SELECT USING (cleaner_is_assigned_to_host(auth.uid(), host_user_id));

-- listings
CREATE POLICY "Host can manage own listings" ON public.listings FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can view assigned listings" ON public.listings FOR SELECT USING (cleaner_has_listing_access(auth.uid(), id));

-- cleaner_assignments
CREATE POLICY "Host can manage assignments" ON public.cleaner_assignments FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can view own assignments" ON public.cleaner_assignments FOR SELECT USING (cleaner_user_id = auth.uid());

-- bookings
CREATE POLICY "Host can manage bookings" ON public.bookings FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can view assigned bookings" ON public.bookings FOR SELECT USING (cleaner_has_listing_access(auth.uid(), listing_id));

-- cleaning_tasks
CREATE POLICY "Host can manage tasks" ON public.cleaning_tasks FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can view assigned tasks" ON public.cleaning_tasks FOR SELECT USING (cleaner_has_listing_access(auth.uid(), listing_id));
CREATE POLICY "Cleaner can update assigned tasks" ON public.cleaning_tasks FOR UPDATE USING (assigned_cleaner_user_id = auth.uid());

-- checklist_templates
CREATE POLICY "Host can manage templates" ON public.checklist_templates FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can view templates" ON public.checklist_templates FOR SELECT USING (cleaner_is_assigned_to_host(auth.uid(), host_user_id));

-- checklist_sections
CREATE POLICY "Host can manage sections" ON public.checklist_sections FOR ALL USING (has_role(auth.uid(), 'host'::app_role));
CREATE POLICY "Cleaner can view sections" ON public.checklist_sections FOR SELECT USING (host_user_id IS NULL OR cleaner_is_assigned_to_host(auth.uid(), host_user_id));

-- checklist_items
CREATE POLICY "Host can manage items" ON public.checklist_items FOR ALL USING (has_role(auth.uid(), 'host'::app_role));
CREATE POLICY "Cleaner can view items" ON public.checklist_items FOR SELECT USING (host_user_id IS NULL OR cleaner_is_assigned_to_host(auth.uid(), host_user_id));

-- checklist_runs
CREATE POLICY "Host can view all runs" ON public.checklist_runs FOR SELECT USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can insert runs" ON public.checklist_runs FOR INSERT WITH CHECK (cleaner_user_id = auth.uid());
CREATE POLICY "Cleaner can update own runs" ON public.checklist_runs FOR UPDATE USING (cleaner_user_id = auth.uid());
CREATE POLICY "Cleaner can view own runs" ON public.checklist_runs FOR SELECT USING (cleaner_user_id = auth.uid());

-- checklist_responses
CREATE POLICY "Host can view responses" ON public.checklist_responses FOR SELECT USING (has_role(auth.uid(), 'host'::app_role));
CREATE POLICY "Cleaner can insert responses" ON public.checklist_responses FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.checklist_runs WHERE id = checklist_responses.run_id AND cleaner_user_id = auth.uid()));
CREATE POLICY "Cleaner can update responses" ON public.checklist_responses FOR UPDATE USING (EXISTS (SELECT 1 FROM public.checklist_runs WHERE id = checklist_responses.run_id AND cleaner_user_id = auth.uid()));

-- checklist_photos
CREATE POLICY "Host can view photos" ON public.checklist_photos FOR SELECT USING (has_role(auth.uid(), 'host'::app_role));
CREATE POLICY "Cleaner can insert photos" ON public.checklist_photos FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.checklist_runs WHERE id = checklist_photos.run_id AND cleaner_user_id = auth.uid()));
CREATE POLICY "Cleaner can delete own photos" ON public.checklist_photos FOR DELETE USING (EXISTS (SELECT 1 FROM public.checklist_runs WHERE id = checklist_photos.run_id AND cleaner_user_id = auth.uid()));

-- log_hours
CREATE POLICY "Host can manage hours" ON public.log_hours FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can insert own hours" ON public.log_hours FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Cleaner can view own hours" ON public.log_hours FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Cleaner can update own hours" ON public.log_hours FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Cleaner can delete own hours" ON public.log_hours FOR DELETE USING (user_id = auth.uid());

-- expenses
CREATE POLICY "Host can manage expenses" ON public.expenses FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can insert expenses" ON public.expenses FOR INSERT WITH CHECK (created_by_user_id = auth.uid());
CREATE POLICY "Cleaner can view own expenses" ON public.expenses FOR SELECT USING (created_by_user_id = auth.uid());

-- maintenance_tickets
CREATE POLICY "Host can manage tickets" ON public.maintenance_tickets FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can create tickets" ON public.maintenance_tickets FOR INSERT WITH CHECK (created_by_user_id = auth.uid());
CREATE POLICY "Cleaner can view tickets" ON public.maintenance_tickets FOR SELECT USING (cleaner_is_assigned_to_host(auth.uid(), host_user_id));
CREATE POLICY "Cleaner can update own tickets" ON public.maintenance_tickets FOR UPDATE USING (created_by_user_id = auth.uid());

-- maintenance_updates
CREATE POLICY "Host can manage updates" ON public.maintenance_updates FOR ALL USING (has_role(auth.uid(), 'host'::app_role));
CREATE POLICY "Cleaner can create updates" ON public.maintenance_updates FOR INSERT WITH CHECK (created_by_user_id = auth.uid());
CREATE POLICY "Users can view updates" ON public.maintenance_updates FOR SELECT USING (true);

-- notification_preferences
CREATE POLICY "Users can view own prefs" ON public.notification_preferences FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own prefs" ON public.notification_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own prefs" ON public.notification_preferences FOR UPDATE USING (user_id = auth.uid());

-- notification_jobs
CREATE POLICY "Host can manage jobs" ON public.notification_jobs FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "User can view own jobs" ON public.notification_jobs FOR SELECT USING (user_id = auth.uid());

-- in_app_notifications
CREATE POLICY "User can view own notifications" ON public.in_app_notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "User can update own notifications" ON public.in_app_notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Host can insert notifications" ON public.in_app_notifications FOR INSERT WITH CHECK (has_role(auth.uid(), 'host'::app_role));

-- products
CREATE POLICY "Host can manage products" ON public.products FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can view products" ON public.products FOR SELECT USING (cleaner_is_assigned_to_host(auth.uid(), host_user_id));

-- shopping_submissions
CREATE POLICY "Host can manage submissions" ON public.shopping_submissions FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can create submissions" ON public.shopping_submissions FOR INSERT WITH CHECK (created_by_user_id = auth.uid());
CREATE POLICY "Cleaner can view submissions" ON public.shopping_submissions FOR SELECT USING (cleaner_is_assigned_to_host(auth.uid(), host_user_id));

-- shopping_list
CREATE POLICY "Host can manage shopping list" ON public.shopping_list FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can create items" ON public.shopping_list FOR INSERT WITH CHECK (created_by_user_id = auth.uid());
CREATE POLICY "Cleaner can view items" ON public.shopping_list FOR SELECT USING (cleaner_is_assigned_to_host(auth.uid(), host_user_id));
CREATE POLICY "Cleaner can update own items" ON public.shopping_list FOR UPDATE USING (created_by_user_id = auth.uid());

-- payout_periods
CREATE POLICY "Host can manage periods" ON public.payout_periods FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can view periods" ON public.payout_periods FOR SELECT USING (EXISTS (SELECT 1 FROM public.payouts WHERE period_id = payout_periods.id AND cleaner_user_id = auth.uid()));

-- payouts
CREATE POLICY "Host can manage payouts" ON public.payouts FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can view own payouts" ON public.payouts FOR SELECT USING (cleaner_user_id = auth.uid());

-- guides_folders
CREATE POLICY "Host can manage folders" ON public.guides_folders FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can view folders" ON public.guides_folders FOR SELECT USING (cleaner_is_assigned_to_host(auth.uid(), host_user_id));

-- guides
CREATE POLICY "Host can manage guides" ON public.guides FOR ALL USING (host_user_id = auth.uid());
CREATE POLICY "Cleaner can view guides" ON public.guides FOR SELECT USING (cleaner_is_assigned_to_host(auth.uid(), host_user_id));
