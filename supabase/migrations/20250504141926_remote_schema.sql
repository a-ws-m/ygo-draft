

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE PROCEDURE "public"."delete_expired_drafts"()
    LANGUAGE "plpgsql"
    AS $$
begin
    -- Delete cube entries for expired drafts (waiting for more than 10 minutes)
    delete from cubes
    where draft_id in (
        select id from drafts
        where status = 'waiting'
          and (created_at < now() - interval '10 minutes')
    );

    -- Delete cube entries for drafts older than 5 hours
    delete from cubes
    where draft_id in (
        select id from drafts
        where created_at < now() - interval '5 hours'
    );

    -- Delete expired drafts (waiting for more than 10 minutes)
    delete from drafts
    where status = 'waiting'
      and (created_at < now() - interval '10 minutes');

    -- Delete drafts older than 5 hours
    delete from drafts
    where created_at < now() - interval '5 hours';
    
end;
$$;


ALTER PROCEDURE "public"."delete_expired_drafts"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."cubes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "draft_id" "uuid",
    "name" "text",
    "type" "text",
    "apiData" "jsonb",
    "index" smallint,
    "owner" "text",
    "pile" smallint,
    "imageUrl" "text",
    "smallImageUrl" "text"
);


ALTER TABLE "public"."cubes" OWNER TO "postgres";


COMMENT ON TABLE "public"."cubes" IS 'Store cube data linked to a specific draft session.';



CREATE TABLE IF NOT EXISTS "public"."drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "connected_users" smallint DEFAULT '0'::smallint,
    "draft_method" "text",
    "pool_size" bigint,
    "number_of_players" smallint,
    "status" "text" DEFAULT '"waiting"'::"text",
    "participants" "uuid"[],
    "current_player" smallint DEFAULT '0'::smallint,
    "number_of_piles" smallint,
    "pack_size" smallint,
    "created_by" "uuid"
);


ALTER TABLE "public"."drafts" OWNER TO "postgres";


COMMENT ON TABLE "public"."drafts" IS 'Manage references to current drafts';



CREATE OR REPLACE VIEW "public"."player_card_counts" AS
 SELECT "cubes"."owner",
    "count"(*) AS "card_count"
   FROM "public"."cubes"
  WHERE ("cubes"."owner" IS NOT NULL)
  GROUP BY "cubes"."owner";


ALTER TABLE "public"."player_card_counts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."cubes"
    ADD CONSTRAINT "cubes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drafts"
    ADD CONSTRAINT "drafts_pkey" PRIMARY KEY ("id");



CREATE POLICY "Authenticated users can create cubes" ON "public"."cubes" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can create drafts" ON "public"."drafts" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for all users" ON "public"."cubes" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."drafts" FOR SELECT USING (true);



CREATE POLICY "Users can update cubes for their drafts" ON "public"."cubes" FOR UPDATE USING (("draft_id" IN ( SELECT "drafts"."id"
   FROM "public"."drafts"
  WHERE ("auth"."uid"() IN ( SELECT "unnest"("drafts"."participants") AS "unnest")))));



CREATE POLICY "Users can update their own drafts" ON "public"."drafts" FOR UPDATE USING (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."cubes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drafts" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
































































































































































































GRANT ALL ON PROCEDURE "public"."delete_expired_drafts"() TO "anon";
GRANT ALL ON PROCEDURE "public"."delete_expired_drafts"() TO "authenticated";
GRANT ALL ON PROCEDURE "public"."delete_expired_drafts"() TO "service_role";
























GRANT ALL ON TABLE "public"."cubes" TO "anon";
GRANT ALL ON TABLE "public"."cubes" TO "authenticated";
GRANT ALL ON TABLE "public"."cubes" TO "service_role";



GRANT ALL ON TABLE "public"."drafts" TO "anon";
GRANT ALL ON TABLE "public"."drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."drafts" TO "service_role";



GRANT ALL ON TABLE "public"."player_card_counts" TO "anon";
GRANT ALL ON TABLE "public"."player_card_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."player_card_counts" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
