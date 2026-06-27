"use client";

import glossary from "@/data/glossary.json";
import { useState } from "react";

interface GlossaryTermProps {
  term: string;
  children?: React.ReactNode;
}

export function GlossaryTerm({ term, children }: GlossaryTermProps) {
  const key = term.replace(/[^a-zA-Z0-9]/g, "");
  const entry =
    (glossary as Record<string, string>)[term] ??
    (glossary as Record<string, string>)[key] ??
    Object.entries(glossary as Record<string, string>).find(([k]) =>
      term.toUpperCase().includes(k.toUpperCase())
    )?.[1];

  const [open, setOpen] = useState(false);

  if (!entry) {
    return <>{children ?? term}</>;
  }

  return (
    <span className="relative inline">
      <button
        type="button"
        className="cursor-help border-b border-dotted border-copper/50 text-inherit lumen-focus rounded-sm"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-describedby={open ? `glossary-${key}` : undefined}
      >
        {children ?? term}
      </button>
      {open && (
        <span
          id={`glossary-${key}`}
          role="tooltip"
          className="absolute bottom-full left-0 z-20 mb-1 w-64 rounded-lg border border-rule bg-paper px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed text-ink-muted shadow-[var(--shadow-lift)]"
        >
          {entry}
        </span>
      )}
    </span>
  );
}

export function glossarizeText(text: string): React.ReactNode[] {
  const terms = Object.keys(glossary as Record<string, string>).sort(
    (a, b) => b.length - a.length
  );
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    let matched = false;
    for (const term of terms) {
      const idx = remaining.toLowerCase().indexOf(term.toLowerCase());
      if (idx >= 0) {
        if (idx > 0) parts.push(remaining.slice(0, idx));
        const slice = remaining.slice(idx, idx + term.length);
        parts.push(
          <GlossaryTerm key={key++} term={term}>
            {slice}
          </GlossaryTerm>
        );
        remaining = remaining.slice(idx + term.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      parts.push(remaining);
      break;
    }
  }
  return parts;
}
