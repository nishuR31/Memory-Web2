import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScrollableRegion from '../ScrollableRegion';

describe('ScrollableRegion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('hands off wheel scrolling to page when region is at bottom', () => {
    const scrollSpy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    const { container } = render(
      <ScrollableRegion className="max-h-20 overflow-y-auto">
        <div style={{ height: 400 }}>content</div>
      </ScrollableRegion>
    );

    const region = container.firstElementChild as HTMLDivElement;

    Object.defineProperty(region, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(region, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(region, 'scrollTop', { value: 200, configurable: true });

    fireEvent.wheel(region, { deltaY: 50 });

    expect(scrollSpy).toHaveBeenCalledWith({ top: 50, behavior: 'auto' });
  });

  it('does not hand off wheel scrolling while region can still scroll internally', () => {
    const scrollSpy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    const { container } = render(
      <ScrollableRegion className="max-h-20 overflow-y-auto">
        <div style={{ height: 400 }}>content</div>
      </ScrollableRegion>
    );

    const region = container.firstElementChild as HTMLDivElement;

    Object.defineProperty(region, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(region, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(region, 'scrollTop', { value: 100, configurable: true });

    fireEvent.wheel(region, { deltaY: 30 });

    expect(scrollSpy).not.toHaveBeenCalled();
  });
});
