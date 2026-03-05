import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import ComplexitySlider from '../ComplexitySlider';

// Radix Slider uses ResizeObserver internally, which jsdom doesn't provide
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('ComplexitySlider', () => {
  it('renders slider with Radix Slider root element', () => {
    render(
      <ComplexitySlider currentLevel={3} onLevelChange={vi.fn()} isStreaming={false} />
    );
    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
  });

  it('slider has correct min/max/step attributes', () => {
    render(
      <ComplexitySlider currentLevel={3} onLevelChange={vi.fn()} isStreaming={false} />
    );
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemin', '1');
    expect(slider).toHaveAttribute('aria-valuemax', '5');
  });

  it('renders all five level labels', () => {
    render(
      <ComplexitySlider currentLevel={3} onLevelChange={vi.fn()} isStreaming={false} />
    );
    expect(screen.getByText('ELI5')).toBeInTheDocument();
    expect(screen.getByText('Simple')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Technical')).toBeInTheDocument();
    expect(screen.getByText('Expert')).toBeInTheDocument();
  });

  it('slider is disabled when isStreaming=true', () => {
    render(
      <ComplexitySlider currentLevel={3} onLevelChange={vi.fn()} isStreaming={true} />
    );
    const slider = screen.getByRole('slider');
    // Radix Slider uses data-disabled attribute on the thumb
    expect(slider).toHaveAttribute('data-disabled');
  });

  it('shows streaming indicator when isStreaming=true', () => {
    render(
      <ComplexitySlider currentLevel={1} onLevelChange={vi.fn()} isStreaming={true} />
    );
    expect(screen.getByText(/rewriting/i)).toBeInTheDocument();
  });
});
