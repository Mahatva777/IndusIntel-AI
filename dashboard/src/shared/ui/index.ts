/**
 * Shared UI barrel export.
 *
 * Every panel imports semantic UI primitives from here — never from
 * individual files — so the import boundary is stable.
 */
export { SeverityIndicator } from "./SeverityIndicator";
export { StatusBadge, type StatusValue } from "./StatusBadge";
export { Badge, type BadgeType } from "./Badge";
export { Typo, type TypoLevel } from "./Typography";
export { AnimationWrapper, type AnimationEvent } from "./AnimationWrapper";
export { ConfirmDialog } from "./ConfirmDialog";
