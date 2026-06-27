import naiveFixture from "@/data/demo/naive-baseline.json";
import type { NaiveBaselineFixture } from "./loadFixtures";

export function loadNaiveBaselineClient(): NaiveBaselineFixture {
  return naiveFixture as NaiveBaselineFixture;
}
