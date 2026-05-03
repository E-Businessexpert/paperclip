ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_company_project_created_idx" ON "activity_log" USING btree ("company_id","project_id","created_at");--> statement-breakpoint
