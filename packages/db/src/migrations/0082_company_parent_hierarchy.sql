ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "parent_company_id" uuid;
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_parent_company_id_fkey" FOREIGN KEY ("parent_company_id") REFERENCES "companies"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_parent_company_id_idx" ON "companies" USING btree ("parent_company_id");
