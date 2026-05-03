ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "parent_company_id" uuid REFERENCES "companies"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_parent_company_id_idx" ON "companies" ("parent_company_id");
