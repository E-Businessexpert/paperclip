import { useEffect, useMemo } from "react";
import { useLocation, useParams } from "@/lib/router";
import { OrgChart } from "./OrgChart";
import { useCompany } from "../context/CompanyContext";
import { shouldSyncCompanySelectionFromRoute } from "../lib/company-selection";

export function FullStructurePage() {
  const { companyPrefix } = useParams<{ companyPrefix: string }>();
  const location = useLocation();
  const {
    companies,
    loading,
    selectedCompanyId,
    selectionSource,
    setSelectedCompanyId,
  } = useCompany();

  const matchedCompany = useMemo(() => {
    if (!companyPrefix) return null;
    const normalized = companyPrefix.toUpperCase();
    return companies.find((company) => company.issuePrefix.toUpperCase() === normalized) ?? null;
  }, [companies, companyPrefix]);

  const enterpriseRootCompany = useMemo(
    () =>
      companies.find((company) => /family trust/i.test(company.name))
      ?? companies.find((company) => /cornerstone/i.test(company.name))
      ?? matchedCompany
      ?? companies[0]
      ?? null,
    [companies, matchedCompany],
  );

  useEffect(() => {
    if (loading || !enterpriseRootCompany) return;
    if (
      shouldSyncCompanySelectionFromRoute({
        selectionSource,
        selectedCompanyId,
        routeCompanyId: enterpriseRootCompany.id,
      })
    ) {
      setSelectedCompanyId(enterpriseRootCompany.id, { source: "route_sync" });
    }
  }, [
    enterpriseRootCompany,
    loading,
    selectedCompanyId,
    selectionSource,
    setSelectedCompanyId,
  ]);

  const backTo =
    typeof (location.state as { backTo?: string } | null)?.backTo === "string"
      ? (location.state as { backTo?: string }).backTo!
      : "/dashboard";

  return (
    <div className="h-[100dvh] bg-background p-3 md:p-5">
      <OrgChart
        fullscreen
        lockViewMode="hierarchy"
        showBackButton
        backHref={backTo}
        title="Full Structure"
        subtitle={
          enterpriseRootCompany
            ? `Hierarchy view rooted in ${enterpriseRootCompany.name}. Only the trust lane starts open; expand subdivisions as needed.`
            : "Hierarchy view with only the top trust lane open at first."
        }
      />
    </div>
  );
}
