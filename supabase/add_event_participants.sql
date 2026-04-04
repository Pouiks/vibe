-- Table to store participants
CREATE TABLE IF NOT EXISTS public.event_participants (
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- RLS
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Visible to all" ON public.event_participants;
    DROP POLICY IF EXISTS "Users can join" ON public.event_participants;
    DROP POLICY IF EXISTS "Users can leave" ON public.event_participants;
END $$;

CREATE POLICY "Visible to all" ON public.event_participants FOR SELECT USING (true);
CREATE POLICY "Users can join" ON public.event_participants FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.role() = 'anon');
CREATE POLICY "Users can leave" ON public.event_participants FOR DELETE USING (auth.uid() = user_id OR auth.role() = 'anon');

-- Trigger to update current_participants
CREATE OR REPLACE FUNCTION public.update_event_participants_count()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.events SET current_participants = current_participants + 1 WHERE id = NEW.event_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.events SET current_participants = current_participants - 1 WHERE id = OLD.event_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_participants_count ON public.event_participants;

CREATE TRIGGER trg_event_participants_count
AFTER INSERT OR DELETE ON public.event_participants
FOR EACH ROW EXECUTE PROCEDURE public.update_event_participants_count();
