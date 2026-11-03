import { OverviewSkeleton } from "@/components/page-skeletons";

// Instant shell for /app while overview data loads.
export default function AppLoading() {
  return <OverviewSkeleton />;
}
