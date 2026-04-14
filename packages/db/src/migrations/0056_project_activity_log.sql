ALTER TABLE "activity_log" ADD COLUMN "project_id" uuid REFERENCES "projects"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX "activity_log_company_project_created_idx" ON "activity_log" USING btree ("company_id","project_id","created_at");--> statement-breakpoint
