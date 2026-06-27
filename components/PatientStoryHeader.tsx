import { glossarizeText } from "./GlossaryTerm";

interface PatientStoryHeaderProps {
  story: string;
}

export function PatientStoryHeader({ story }: PatientStoryHeaderProps) {
  return (
    <div className="rounded-2xl border border-rule bg-parchment-deep/50 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-faint">
        Patient story
      </p>
      <p className="mt-2 text-base leading-relaxed text-ink">
        {glossarizeText(story)}
      </p>
    </div>
  );
}
