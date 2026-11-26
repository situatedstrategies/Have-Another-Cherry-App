import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';

// React.lazy with the Suspense boundary built in, for a screen or a modal that
// opens on a click: the component's code is fetched the first time it renders,
// and until it arrives the fallback (nothing, by default) stands in. Keeps
// each lazy component a one-line swap at its import, with no boundary to add
// at every render site.
export default function lazyWithFallback<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
  fallback: ReactNode = null
) {
  const Lazy = lazy(loader);
  return function LazyWithFallback(props: P) {
    return (
      <Suspense fallback={fallback}>
        <Lazy {...(props as any)} />
      </Suspense>
    );
  };
}
