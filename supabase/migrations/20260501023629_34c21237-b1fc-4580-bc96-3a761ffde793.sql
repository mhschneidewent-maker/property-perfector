-- Add Decor8 staging fields to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS style text,
  ADD COLUMN IF NOT EXISTS room_type text,
  ADD COLUMN IF NOT EXISTS prompt text,
  ADD COLUMN IF NOT EXISTS num_variations integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'lovable';

-- Per-variation results for staging runs
CREATE TABLE IF NOT EXISTS public.staging_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  image_path text NOT NULL,
  variation_index integer NOT NULL,
  provider text NOT NULL DEFAULT 'decor8',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staging_results_project ON public.staging_results(project_id);
CREATE INDEX IF NOT EXISTS idx_staging_results_user ON public.staging_results(user_id);

ALTER TABLE public.staging_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own staging results"
  ON public.staging_results FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own staging results"
  ON public.staging_results FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own staging results"
  ON public.staging_results FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.staging_results;