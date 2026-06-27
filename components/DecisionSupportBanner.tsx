export function DecisionSupportBanner() {
  return (
    <div className="mt-10 rounded-xl border border-rule bg-parchment-deep/40 px-5 py-4 text-sm leading-relaxed text-ink-muted print:border-ink/20">
      <p>
        <span className="font-semibold text-ink">Decision support</span> — a
        coordinator reviews these results and the Principal Investigator
        confirms eligibility. Lumen never enrolls a patient or issues a final
        ruling.
      </p>
      <p className="mt-2 text-xs text-ink-faint">
        UNKNOWN criteria need human verification. Pre-screen only — a clinician
        confirms eligibility before any contact or consent. The resolution loop
        prepares the next step for the care team; it does not auto-enroll.
      </p>
    </div>
  );
}
