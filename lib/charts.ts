import { getPatientWithChart } from "./db/patients";

export async function loadChart(slug: string) {
  const { chart } = await getPatientWithChart(slug);
  return chart;
}
