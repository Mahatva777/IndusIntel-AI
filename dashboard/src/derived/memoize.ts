/**
 * Minimal single-slot memoizer ("reselect"-style: last args in, cached
 * result out) backing every derived selector in this module. §2.9 requires
 * derived selectors to be "Recomputed only when dependencies change" — as
 * long as callers pass in the normalized state *references* returned by
 * each store (which only change identity on an actual write, per the
 * immutable-update convention used throughout `@shared/normalization`),
 * this cache hits on every render where nothing relevant changed.
 */
export function memoize<Args extends readonly unknown[], R>(
  compute: (...args: Args) => R,
): (...args: Args) => R {
  let lastArgs: Args | undefined;
  let lastResult: R | undefined;
  let hasResult = false;

  return (...args: Args): R => {
    if (
      hasResult &&
      lastArgs !== undefined &&
      args.length === lastArgs.length &&
      args.every((arg, index) => Object.is(arg, lastArgs![index]))
    ) {
      return lastResult as R;
    }
    const result = compute(...args);
    lastArgs = args;
    lastResult = result;
    hasResult = true;
    return result;
  };
}
