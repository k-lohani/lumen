import { Suspense } from "react";
import HomePageClient from "./HomePageClient";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-5 py-12 text-sm text-ink-faint">
          Loading…
        </div>
      }
    >
      <HomePageClient />
    </Suspense>
  );
}
