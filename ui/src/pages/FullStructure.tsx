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

  useEffect(() => {
    if (loading || !matchedCompany) return;
    if (
      shouldSyncCompanySelectionFromRoute({
        selectionSource,
        selectedCompanyId,
        routeCompanyId: matchedCompany.id,
      })
    ) {
      setSelectedCompanyId(matchedCompany.id, { source: "route_sync" });
    }
  }, [loading, matchedCompany, selectedCompanyId, selectionSource, setSelectedCompanyId]);

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
          matchedCompany
            ? `Hierarchy view rooted in ${matchedCompany.name}. Use the node toggles to collapse subdivisions.`
            : "Hierarchy view with individually collapsible subdivisions."
        }
      />
    </div>
  );
}
