/**
 * Tailwind theme extension for the Dashboard's semantic design tokens.
 *
 * Source of truth for the STRUCTURE below (names, hierarchy, ordering, and
 * semantic meaning) is FRONTEND_ENGINEERING_SPEC.md §16.2–16.7. Every token
 * name and every tier ordering here is frozen by the spec and must not be
 * renamed, reordered, or collapsed.
 *
 * Source of truth for the VALUES (hex codes, exact px/rem, exact durations)
 * is NOT the spec — §16 defines semantic meaning and hierarchy only and is
 * explicitly written to be "independent of implementation technology"
 * (§16.1). See src/shared/tokens/README.md for the flagged gap and the
 * placeholder values used here.
 *
 * Colors resolve through CSS variables (src/shared/tokens/tokens.css) rather
 * than hard-coded hex, so the values can be swapped in one place once real
 * design values exist, without touching this file or any component.
 */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // §16.2 Severity Hierarchy — Emergency > Critical > Warning > Advisory > Normal > Information
        severity: {
          emergency: "var(--color-severity-emergency)",
          critical: "var(--color-severity-critical)",
          warning: "var(--color-severity-warning)",
          advisory: "var(--color-severity-advisory)",
          normal: "var(--color-severity-normal)",
          information: "var(--color-severity-information)",
        },
        // §16.3 Status Hierarchy
        status: {
          active: "var(--color-status-active)",
          acknowledged: "var(--color-status-acknowledged)",
          escalated: "var(--color-status-escalated)",
          resolved: "var(--color-status-resolved)",
          archived: "var(--color-status-archived)",
          unavailable: "var(--color-status-unavailable)",
        },
      },
      fontSize: {
        // §16.7 Typography Hierarchy — Level 1 (highest) through Level 6 (lowest)
        "type-1": ["var(--font-size-level-1)", { lineHeight: "var(--line-height-level-1)" }],
        "type-2": ["var(--font-size-level-2)", { lineHeight: "var(--line-height-level-2)" }],
        "type-3": ["var(--font-size-level-3)", { lineHeight: "var(--line-height-level-3)" }],
        "type-4": ["var(--font-size-level-4)", { lineHeight: "var(--line-height-level-4)" }],
        "type-5": ["var(--font-size-level-5)", { lineHeight: "var(--line-height-level-5)" }],
        "type-6": ["var(--font-size-level-6)", { lineHeight: "var(--line-height-level-6)" }],
      },
      fontFamily: {
        // §10.5 requires a sans-serif optimized for industrial displays but
        // does not name one. Placeholder system stack — see tokens README.
        industrial: "var(--font-family-industrial)",
      },
      transitionDuration: {
        // §16.4 Animation Semantics — names are frozen, durations are not specified.
        "anim-attention": "var(--anim-duration-attention)",
        "anim-emphasis": "var(--anim-duration-emphasis)",
        "anim-recovery": "var(--anim-duration-recovery)",
      },
      zIndex: {
        // §16.6 Panel Priority — higher priority panels receive layout
        // precedence during constrained space. Expressed here as a z-index
        // scale only where stacking (not just layout order) is needed.
        "panel-p1": "var(--z-panel-p1)",
        "panel-p2": "var(--z-panel-p2)",
        "panel-p3": "var(--z-panel-p3)",
        "panel-p4": "var(--z-panel-p4)",
        "panel-p5": "var(--z-panel-p5)",
        "panel-p6": "var(--z-panel-p6)",
      },
    },
  },
  plugins: [],
};
