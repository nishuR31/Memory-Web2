import { useRef, type PropsWithChildren, type TouchEvent, type WheelEvent } from 'react';

interface ScrollableRegionProps extends PropsWithChildren {
  className?: string;
}

export default function ScrollableRegion({ className, children }: ScrollableRegionProps) {
  const regionRef = useRef<HTMLDivElement | null>(null);
  const touchStartY = useRef<number | null>(null);

  const atTop = (element: HTMLDivElement) => element.scrollTop <= 0;
  const atBottom = (element: HTMLDivElement) =>
    element.scrollTop + element.clientHeight >= element.scrollHeight - 1;

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const element = regionRef.current;
    if (!element) {
      return;
    }

    const deltaY = event.deltaY;
    const shouldHandoff = (deltaY < 0 && atTop(element)) || (deltaY > 0 && atBottom(element));

    if (shouldHandoff) {
      window.scrollBy({ top: deltaY, behavior: 'auto' });
      return;
    }

    event.stopPropagation();
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartY.current = event.touches[0]?.clientY ?? null;
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const element = regionRef.current;
    const startY = touchStartY.current;
    const currentY = event.touches[0]?.clientY;

    if (!element || startY === null || currentY === undefined) {
      return;
    }

    const delta = startY - currentY;
    const shouldHandoff = (delta < 0 && atTop(element)) || (delta > 0 && atBottom(element));

    if (shouldHandoff) {
      window.scrollBy({ top: delta, behavior: 'auto' });
      touchStartY.current = currentY;
      return;
    }

    event.stopPropagation();
    touchStartY.current = currentY;
  };

  return (
    <div
      ref={regionRef}
      className={className}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
    >
      {children}
    </div>
  );
}
