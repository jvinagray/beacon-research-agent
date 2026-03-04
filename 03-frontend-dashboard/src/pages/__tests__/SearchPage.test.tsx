import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SearchPage from '../SearchPage';
import type { ResearchState } from '../../types/research';

const mockStartResearch = vi.fn();
const mockReset = vi.fn();
const mockNavigate = vi.fn();

let mockState: ResearchState;

const initialState: ResearchState = {
  status: 'idle',
  statusMessage: '',
  topic: '',
  depth: '',
  sources: [],
  sourceTotal: 0,
  artifacts: {},
  sessionId: null,
  summary: null,
  error: null,
};

vi.mock('../../hooks/useResearch', () => ({
  useResearch: () => ({
    state: mockState,
    startResearch: mockStartResearch,
    reset: mockReset,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderSearchPage = () =>
  render(
    <MemoryRouter>
      <SearchPage />
    </MemoryRouter>
  );

describe('SearchPage', () => {
  beforeEach(() => {
    mockState = { ...initialState };
    mockStartResearch.mockReset();
    mockReset.mockReset();
    mockNavigate.mockReset();
  });

  it('renders search input, depth selector, and research button', () => {
    renderSearchPage();
    expect(screen.getByPlaceholderText(/what do you want to learn/i)).toBeInTheDocument();
    expect(screen.getByText('Quick')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Deep')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /research/i })).toBeInTheDocument();
  });

  it('clicking Research button disables input and button', () => {
    mockState = { ...initialState, status: 'loading' };
    renderSearchPage();
    const button = screen.getByRole('button', { name: /research/i });
    expect(button).toBeDisabled();
    const input = screen.getByPlaceholderText(/what do you want to learn/i);
    expect(input).toBeDisabled();
  });

  it('progress feed shows statusMessage during streaming', () => {
    mockState = {
      ...initialState,
      status: 'streaming',
      statusMessage: 'Evaluating sources...',
    };
    renderSearchPage();
    expect(screen.getByText('Evaluating sources...')).toBeInTheDocument();
  });

  it('source cards appear as source_evaluated events arrive', () => {
    mockState = {
      ...initialState,
      status: 'streaming',
      sources: [
        {
          url: 'http://example.com',
          title: 'React Docs',
          snippet: 'Official docs',
          signals: {
            learning_efficiency_score: 8,
            content_type: 'docs',
            time_estimate_minutes: 15,
            recency: '2024',
            key_insight: 'Comprehensive guide',
            coverage: ['react'],
            evaluation_failed: false,
          },
          deep_read_content: null,
          extraction_method: null,
        },
      ],
      sourceTotal: 5,
    };
    renderSearchPage();
    expect(screen.getByText('React Docs')).toBeInTheDocument();
  });

  it('error banner appears on non-recoverable error', () => {
    mockState = {
      ...initialState,
      status: 'error',
      error: { message: 'Server exploded', recoverable: false },
    };
    renderSearchPage();
    expect(screen.getByText(/server exploded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('"Try Again" button resets state and re-submits', () => {
    mockState = {
      ...initialState,
      status: 'error',
      error: { message: 'Server error', recoverable: false },
    };
    renderSearchPage();

    // Type a topic first
    const input = screen.getByPlaceholderText(/what do you want to learn/i);
    fireEvent.change(input, { target: { value: 'React' } });

    const tryAgain = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(tryAgain);
    expect(mockReset).toHaveBeenCalled();
    expect(mockStartResearch).toHaveBeenCalledWith('React', 'standard');
  });

  it('navigates to /dashboard on complete', () => {
    mockState = {
      ...initialState,
      status: 'complete',
      sessionId: 'abc',
      sources: [],
      artifacts: {},
      topic: 'React',
      depth: 'standard',
      summary: { topic: 'React', depth: 'standard', source_count: 0, artifact_types: [] },
    };
    renderSearchPage();
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', expect.objectContaining({ state: expect.any(Object) }));
  });
});
