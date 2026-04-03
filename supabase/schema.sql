BEGIN;

-- 0. CLEANUP (Drop tables and functions to allow rebuild)
DROP EXTENSION IF EXISTS pg_cron CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS generate_random_username() CASCADE;

DROP TABLE IF EXISTS public.push_subscriptions CASCADE;
DROP TABLE IF EXISTS public.channel_subscriptions CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.venues CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 1. Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  first_name text DEFAULT '',
  age int DEFAULT NULL,
  gender text DEFAULT '',
  avatar_idx int DEFAULT 1,
  is_premium boolean DEFAULT false,
  bio text DEFAULT '',
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Venues
CREATE TABLE public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  category text CHECK (category IN ('sport', 'cafe', 'bar', 'other')) NOT NULL,
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  owner_id uuid REFERENCES public.profiles(id) DEFAULT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. Events
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  creator_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  start_time timestamp with time zone NOT NULL,
  max_participants int NOT NULL,
  current_participants int DEFAULT 1,
  created_at timestamp with time zone DEFAULT now()
);

-- 4. Messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 5. Push Subscriptions (Browser endpoints)
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text UNIQUE NOT NULL,
  auth text NOT NULL,
  p256dh text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 6. Channel Subscriptions (Who follows which venue)
CREATE TABLE public.channel_subscriptions (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (user_id, venue_id)
);


-- RANDOM USERNAME GENERATION
CREATE OR REPLACE FUNCTION generate_random_username()
RETURNS text AS $$
DECLARE
  adjectives text[] := ARRAY['Happy', 'Crazy', 'Sleepy', 'Brave', 'Shiny', 'Swift', 'Chill', 'Wild', 'Epic', 'Cosmic', 'Cool', 'Vibe'];
  animals text[] := ARRAY['Panda', 'Tiger', 'Bear', 'Falcon', 'Wolf', 'Fox', 'Koala', 'Lion', 'Duck', 'Owl', 'Cat', 'Dog', 'Dolphin'];
  adj_idx int;
  anim_idx int;
  result text;
  num int;
BEGIN
  adj_idx := floor(random() * array_length(adjectives, 1) + 1);
  anim_idx := floor(random() * array_length(animals, 1) + 1);
  num := floor(random() * 999) + 1;
  result := adjectives[adj_idx] || animals[anim_idx] || num::text;
  RETURN result;
END;
$$ LANGUAGE plpgsql;


-- TRIGGER FOR NEW USERS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (new.id, public.generate_random_username());
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Venues are visible to everyone" ON public.venues FOR SELECT USING (true);
CREATE POLICY "Profiles are visible to everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Events visible to everyone" ON public.events FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert events" ON public.events FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');
CREATE POLICY "Users can update events" ON public.events FOR UPDATE USING (true);

CREATE POLICY "Messages visible to everyone" ON public.messages FOR SELECT USING (true);
CREATE POLICY "Users can insert messages" ON public.messages FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'anon') AND auth.uid() = user_id);

CREATE POLICY "Users manage own push subs" ON public.push_subscriptions USING (auth.uid() = user_id);
CREATE POLICY "Users manage own channel subs" ON public.channel_subscriptions USING (auth.uid() = user_id);

-- ENABLE REALTIME
DROP PUBLICATION IF EXISTS supabase_realtime CASCADE;
CREATE PUBLICATION supabase_realtime FOR TABLE public.messages, public.events;

COMMIT;
