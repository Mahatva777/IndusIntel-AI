import { useRef, useEffect, useState } from "react";

export function useFrameTime(enabled: boolean = false) {
  const [fps, setFps] = useState(60);
  const [frameTime, setFrameTime] = useState(16);
  const lastTimeRef = useRef<number>(performance.now());
  const framesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let animationFrameId: number;

    const measure = () => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      // Keep last 60 frames for average
      framesRef.current.push(delta);
      if (framesRef.current.length > 60) {
        framesRef.current.shift();
      }

      // Calculate rolling average every ~10 frames to avoid jitter
      if (framesRef.current.length % 10 === 0) {
        const sum = framesRef.current.reduce((a, b) => a + b, 0);
        const avg = sum / framesRef.current.length;
        setFrameTime(avg);
        setFps(1000 / avg);
      }

      animationFrameId = requestAnimationFrame(measure);
    };

    animationFrameId = requestAnimationFrame(measure);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [enabled]);

  return { fps, frameTime };
}
