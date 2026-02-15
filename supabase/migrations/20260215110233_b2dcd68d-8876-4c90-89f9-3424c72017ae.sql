
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'cleaner');
CREATE TYPE public.cleaning_mode AS ENUM ('CLEAN_ON_CHECKIN', 'CLEAN_ON_CHECKOUT');
CREATE TYPE public.cleaning_source AS ENUM ('AUTO', 'MANUAL');
CREATE TYPE public.cleaning_status AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TYPE public.checklist_item_type AS ENUM ('YESNO', 'PHOTO', 'TEXT', 'NUMBER');
CREATE TYPE public.maintenance_status AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');
CREATE TYPE public.maintenance_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE public.shopping_status AS ENUM ('MISSING', 'ORDERED', 'BOUGHT', 'OK');
CREATE TYPE public.payout_period_status AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE public.payout_status AS ENUM ('PENDING', 'PAID');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  hourly_rate_override NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- PROPERTIES
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT DEFAULT 'Europe/London',
  currency TEXT DEFAULT 'EUR',
  default_checkin_time TIME DEFAULT '15:00',
  default_checkout_time TIME DEFAULT '11:00',
  cleaning_mode cleaning_mode DEFAULT 'CLEAN_ON_CHECKOUT',
  ics_url_airbnb TEXT,
  ics_url_booking TEXT,
  ics_url_other TEXT,
  sync_enabled BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view properties" ON public.properties FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage properties" ON public.properties FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- ROOMS
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  checklist_template_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view rooms" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage rooms" ON public.rooms FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- BOOKINGS
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  source_platform TEXT,
  external_uid TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  checkin_at TIMESTAMPTZ,
  checkout_at TIMESTAMPTZ,
  nights INTEGER,
  guests_count INTEGER,
  raw_ics_payload TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view bookings" ON public.bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage bookings" ON public.bookings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- CHECKLIST TEMPLATES
CREATE TABLE public.checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view templates" ON public.checklist_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage templates" ON public.checklist_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- CHECKLIST SECTIONS
CREATE TABLE public.checklist_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.checklist_templates(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);
ALTER TABLE public.checklist_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view sections" ON public.checklist_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage sections" ON public.checklist_sections FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- CHECKLIST ITEMS
CREATE TABLE public.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES public.checklist_sections(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  help_text TEXT,
  type checklist_item_type DEFAULT 'YESNO',
  required BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view items" ON public.checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage items" ON public.checklist_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- CLEANING TASKS
CREATE TABLE public.cleaning_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  source cleaning_source DEFAULT 'MANUAL',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  status cleaning_status DEFAULT 'TODO',
  assigned_cleaner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  next_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  nights_to_show INTEGER,
  guests_to_show INTEGER,
  notes TEXT,
  locked BOOLEAN DEFAULT false,
  checklist_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cleaning_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view cleaning tasks" ON public.cleaning_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage cleaning tasks" ON public.cleaning_tasks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Cleaners can update assigned tasks" ON public.cleaning_tasks FOR UPDATE TO authenticated USING (assigned_cleaner_user_id = auth.uid());

-- CHECKLIST RUNS
CREATE TABLE public.checklist_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaning_task_id UUID REFERENCES public.cleaning_tasks(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  cleaner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  overall_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view runs" ON public.checklist_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Cleaners can insert runs" ON public.checklist_runs FOR INSERT TO authenticated WITH CHECK (cleaner_user_id = auth.uid());
CREATE POLICY "Cleaners can update own runs" ON public.checklist_runs FOR UPDATE TO authenticated USING (cleaner_user_id = auth.uid());

-- CHECKLIST RESPONSES
CREATE TABLE public.checklist_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.checklist_runs(id) ON DELETE CASCADE NOT NULL,
  item_id UUID REFERENCES public.checklist_items(id) ON DELETE CASCADE NOT NULL,
  yesno_value BOOLEAN,
  text_value TEXT,
  number_value NUMERIC,
  photo_url TEXT
);
ALTER TABLE public.checklist_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view responses" ON public.checklist_responses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Cleaners can insert responses" ON public.checklist_responses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Cleaners can update responses" ON public.checklist_responses FOR UPDATE TO authenticated USING (true);

-- LOG HOURS
CREATE TABLE public.log_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_at TIME NOT NULL,
  end_at TIME NOT NULL,
  duration_minutes INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.log_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own hours" ON public.log_hours FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Users can insert own hours" ON public.log_hours FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own hours" ON public.log_hours FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own hours" ON public.log_hours FOR DELETE TO authenticated USING (user_id = auth.uid());

-- EXPENSES
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  shop TEXT,
  reference TEXT,
  receipt_photo_url TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view expenses" ON public.expenses FOR SELECT TO authenticated USING (created_by_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Users can insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (created_by_user_id = auth.uid());
CREATE POLICY "Admins can manage expenses" ON public.expenses FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- MAINTENANCE TICKETS
CREATE TABLE public.maintenance_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  issue TEXT NOT NULL,
  status maintenance_status DEFAULT 'OPEN',
  priority maintenance_priority DEFAULT 'MEDIUM',
  pic1_url TEXT,
  pic2_url TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view tickets" ON public.maintenance_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create tickets" ON public.maintenance_tickets FOR INSERT TO authenticated WITH CHECK (created_by_user_id = auth.uid());
CREATE POLICY "Users can update own tickets" ON public.maintenance_tickets FOR UPDATE TO authenticated USING (created_by_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- MAINTENANCE UPDATES
CREATE TABLE public.maintenance_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE NOT NULL,
  note TEXT NOT NULL,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.maintenance_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view updates" ON public.maintenance_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create updates" ON public.maintenance_updates FOR INSERT TO authenticated WITH CHECK (created_by_user_id = auth.uid());

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- SHOPPING LIST
CREATE TABLE public.shopping_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  quantity_needed INTEGER DEFAULT 1,
  status shopping_status DEFAULT 'MISSING',
  note TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shopping_list ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view shopping list" ON public.shopping_list FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create shopping items" ON public.shopping_list FOR INSERT TO authenticated WITH CHECK (created_by_user_id = auth.uid());
CREATE POLICY "Users can update shopping items" ON public.shopping_list FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete shopping items" ON public.shopping_list FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- PAYOUT PERIODS
CREATE TABLE public.payout_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status payout_period_status DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payout_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view payout periods" ON public.payout_periods FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admins can manage payout periods" ON public.payout_periods FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- PAYOUTS
CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID REFERENCES public.payout_periods(id) ON DELETE CASCADE NOT NULL,
  cleaner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  total_minutes INTEGER DEFAULT 0,
  hourly_rate_used NUMERIC(10,2) NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status payout_status DEFAULT 'PENDING',
  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cleaners can view own payouts" ON public.payouts FOR SELECT TO authenticated USING (cleaner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admins can manage payouts" ON public.payouts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- GUIDES FOLDERS
CREATE TABLE public.guides_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.guides_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view folders" ON public.guides_folders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage folders" ON public.guides_folders FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- GUIDES
CREATE TABLE public.guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES public.guides_folders(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  pdf_url TEXT,
  uploaded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view guides" ON public.guides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage guides" ON public.guides FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cleaning_tasks_updated_at BEFORE UPDATE ON public.cleaning_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_maintenance_tickets_updated_at BEFORE UPDATE ON public.maintenance_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
