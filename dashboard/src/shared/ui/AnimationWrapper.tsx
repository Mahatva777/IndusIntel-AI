/**
 * AnimationWrapper — §16.4 Animation Semantics.
 *
 * "Animation communicates operational state only."
 * "Decorative animations: Prohibited" (§16.8).
 *
 * Wraps children with the appropriate semantic animation class.
 * Only three animation events are permitted by the spec.
 */
import React from "react";

export type AnimationEvent =
  | "attention"   // Emergency — immediate attention
  | "emphasis"    // New Incident / Severity Increase / Selection
  | "recovery"    // Recovery — gradual de-emphasis
  | "none";

const ANIMATION_CLASS: Record<AnimationEvent, string> = {
  attention: "animate-attention",
  emphasis:  "animate-emphasis",
  recovery:  "animate-recovery",
  none:      "",
};

interface AnimationWrapperProps {
  readonly event: AnimationEvent;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export const AnimationWrapper: React.FC<AnimationWrapperProps> = React.memo(
  ({ event, children, className = "" }) => {
    return (
      <div className={`${ANIMATION_CLASS[event]} ${className}`}>
        {children}
      </div>
    );
  },
);

AnimationWrapper.displayName = "AnimationWrapper";
