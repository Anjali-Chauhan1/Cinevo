import { getCurrentUser } from "@/lib/auth";
import { Landing } from "@/components/Landing";
import { DiscoverHome } from "@/components/DiscoverHome";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const user = await getCurrentUser();
  return user ? <DiscoverHome /> : <Landing />;
}
