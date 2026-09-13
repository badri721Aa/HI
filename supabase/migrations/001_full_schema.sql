-- ============================================================
-- Alhekma Cheating — Full Schema Migration
-- Apply in Supabase SQL Editor once
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role        text        NOT NULL DEFAULT 'user'
      CHECK (role IN ('user', 'admin', 'owner')),
  ADD COLUMN IF NOT EXISTS full_name   text,
  ADD COLUMN IF NOT EXISTS avatar_url  text,
  ADD COLUMN IF NOT EXISTS online_at   timestamptz;

-- Seed owners
UPDATE public.profiles
SET role = 'owner'
WHERE email IN ('abdulla.mjasim@alhekma.com', 'abdullahmasoud063@gmail.com');

CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);

-- ── admin_audit_logs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id       uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email    text         NOT NULL,
  action         text         NOT NULL,
  target_email   text,
  target_user_id uuid,
  payload        jsonb,
  ip             text,
  created_at     timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx    ON public.admin_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx  ON public.admin_audit_logs(created_at DESC);

-- ── message_reactions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid  NOT NULL,
  user_id     uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name   text  NOT NULL,
  emoji       text  NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS reactions_message_idx ON public.message_reactions(message_id);

-- ── news: add edited_by, deleted columns ────────────────────
ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS edited_at   timestamptz,
  ADD COLUMN IF NOT EXISTS deleted     boolean NOT NULL DEFAULT false;

-- ── chat_messages: add deleted, reply_to ────────────────────
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS deleted    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_id    uuid    REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_select_all    ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own    ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own    ON public.profiles;
CREATE POLICY profiles_select_all  ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert_own  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- audit logs: only admin/owner can read; nobody inserts directly (use RPC)
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_select ON public.admin_audit_logs;
CREATE POLICY audit_logs_select ON public.admin_audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner')
  ));

-- reactions: public read, own insert/delete
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reactions_select ON public.message_reactions;
DROP POLICY IF EXISTS reactions_insert ON public.message_reactions;
DROP POLICY IF EXISTS reactions_delete ON public.message_reactions;
CREATE POLICY reactions_select ON public.message_reactions FOR SELECT USING (true);
CREATE POLICY reactions_insert ON public.message_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY reactions_delete ON public.message_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- news: public read; admin/owner write
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS news_select ON public.news;
DROP POLICY IF EXISTS news_insert ON public.news;
DROP POLICY IF EXISTS news_update ON public.news;
DROP POLICY IF EXISTS news_delete ON public.news;
CREATE POLICY news_select ON public.news FOR SELECT USING (true);
CREATE POLICY news_insert ON public.news FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner')
  ));
CREATE POLICY news_update ON public.news FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner')
  ));
CREATE POLICY news_delete ON public.news FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner')
  ));

-- chat_messages: public read; own delete or admin delete
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_select   ON public.chat_messages;
DROP POLICY IF EXISTS chat_insert   ON public.chat_messages;
DROP POLICY IF EXISTS chat_delete   ON public.chat_messages;
CREATE POLICY chat_select ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY chat_insert ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY chat_delete ON public.chat_messages FOR DELETE
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  );
CREATE POLICY chat_update ON public.chat_messages FOR UPDATE
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create / sync profile on signup / OAuth login
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN NEW.email IN ('abdulla.mjasim@alhekma.com','abdullahmasoud063@gmail.com') THEN 'owner'
      ELSE 'user'
    END
  )
  ON CONFLICT (id) DO UPDATE SET
    email       = EXCLUDED.email,
    full_name   = COALESCE(EXCLUDED.full_name,  public.profiles.full_name),
    avatar_url  = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    role        = CASE
      WHEN NEW.email IN ('abdulla.mjasim@alhekma.com','abdullahmasoud063@gmail.com') THEN 'owner'
      ELSE public.profiles.role
    END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_user_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET
    full_name  = COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', profiles.full_name),
    avatar_url = COALESCE(NEW.raw_user_meta_data->>'avatar_url', profiles.avatar_url)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_updated();

-- grant_role_by_email — owner-only, runs with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.grant_role_by_email(
  p_target_email text,
  p_target_role  text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role  text;
  v_target_id    uuid;
  v_caller_email text;
BEGIN
  SELECT role, email INTO v_caller_role, v_caller_email
  FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role != 'owner' THEN
    RETURN jsonb_build_object('error', 'Forbidden: only owners can change roles');
  END IF;

  IF p_target_role NOT IN ('user','admin','owner') THEN
    RETURN jsonb_build_object('error', 'Invalid role');
  END IF;

  SELECT id INTO v_target_id FROM public.profiles WHERE email = p_target_email;
  IF v_target_id IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  UPDATE public.profiles SET role = p_target_role WHERE id = v_target_id;

  INSERT INTO public.admin_audit_logs (actor_id, actor_email, action, target_email, target_user_id, payload)
  VALUES (auth.uid(), v_caller_email, 'role_change', p_target_email, v_target_id,
    jsonb_build_object('new_role', p_target_role));

  RETURN jsonb_build_object('success', true, 'email', p_target_email, 'role', p_target_role);
END;
$$;

-- log_admin_action — admin/owner, insert into audit log
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action      text,
  p_target_email text    DEFAULT NULL,
  p_target_id   uuid     DEFAULT NULL,
  p_payload     jsonb    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role  text;
  v_caller_email text;
BEGIN
  SELECT role, email INTO v_caller_role, v_caller_email
  FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin','owner') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  INSERT INTO public.admin_audit_logs
    (actor_id, actor_email, action, target_email, target_user_id, payload)
  VALUES (auth.uid(), v_caller_email, p_action, p_target_email, p_target_id, p_payload);
END;
$$;
