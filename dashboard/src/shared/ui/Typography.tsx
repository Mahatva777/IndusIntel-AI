/**
 * Typography — §16.7 Typography Hierarchy.
 *
 * Level 1 = Emergency banners
 * Level 2 = Incident titles
 * Level 3 = Panel titles
 * Level 4 = Primary operational values
 * Level 5 = Supporting information
 * Level 6 = Metadata
 *
 * "Typography hierarchy remains consistent across all layouts."
 */
import React from "react";

export type TypoLevel = 1 | 2 | 3 | 4 | 5 | 6;

const LEVEL_TAG: Record<TypoLevel, keyof React.JSX.IntrinsicElements> = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "p",
  5: "p",
  6: "span",
};

const LEVEL_CLASSES: Record<TypoLevel, string> = {
  1: "text-type-1 font-bold tracking-tight",
  2: "text-type-2 font-semibold tracking-tight",
  3: "text-type-3 font-semibold",
  4: "text-type-4 font-medium",
  5: "text-type-5",
  6: "text-type-6 text-slate-400",
};

interface TypoProps {
  readonly level: TypoLevel;
  readonly children: React.ReactNode;
  readonly className?: string;
  /** Override the default semantic HTML element. */
  readonly as?: keyof React.JSX.IntrinsicElements;
}

export const Typo: React.FC<TypoProps> = React.memo(
  ({ level, children, className = "", as }) => {
    const Tag = (as ?? LEVEL_TAG[level]) as React.ElementType;
    return (
      <Tag className={`font-industrial ${LEVEL_CLASSES[level]} ${className}`}>
        {children}
      </Tag>
    );
  },
);

Typo.displayName = "Typo";
