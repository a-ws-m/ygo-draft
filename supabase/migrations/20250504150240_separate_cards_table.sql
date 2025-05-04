CREATE TABLE IF NOT EXISTS "public"."cards" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "api_data" "jsonb" NOT NULL,
    "image_url" "text",
    "small_image_url" "text"
);

ALTER TABLE "public"."cards" OWNER TO "postgres";

COMMENT ON TABLE "public"."cards" IS 'Store Yu-Gi-Oh card data fetched from the API';

ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_pkey" PRIMARY KEY ("id");

ALTER TABLE "public"."cards" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service_role can modify cards" ON "public"."cards" 
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Anyone can read cards" ON "public"."cards" 
FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON "public"."cards" FOR SELECT USING (true);

-- Cubes table changes
-- Modify the cubes table structure
ALTER TABLE "public"."cubes" 
    DROP COLUMN IF EXISTS "name",
    DROP COLUMN IF EXISTS "type",
    DROP COLUMN IF EXISTS "apiData",
    DROP COLUMN IF EXISTS "imageUrl",
    DROP COLUMN IF EXISTS "smallImageUrl",
    ADD COLUMN IF NOT EXISTS "card_id" bigint NOT NULL;

-- Add foreign key constraint
ALTER TABLE ONLY "public"."cubes"
    ADD CONSTRAINT "cubes_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id");

DROP POLICY IF EXISTS "Authenticated users can create cubes" ON "public"."cubes";

CREATE POLICY "Users can only create cubes for drafts they created" ON "public"."cubes" 
FOR INSERT WITH CHECK (
  draft_id IN (
    SELECT id FROM public.drafts
    WHERE created_by = auth.uid()
  )
);
