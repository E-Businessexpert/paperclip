ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "project_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activity_log_project_id_projects_id_fk'
  ) THEN
    ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_project_created_idx" ON "activity_log" USING btree ("project_id","created_at");--> statement-breakpoint
