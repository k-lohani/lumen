import HomePageClient from "./HomePageClient";
import { loadInitialHomeData } from "@/lib/server/initialHomeData";

export default async function HomePage() {
  const initial = await loadInitialHomeData("hero");
  return <HomePageClient initial={initial} />;
}
