import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { chatReducer, initialState, useChat } from '../useChat';
import type { ChatState } from '../useChat';

// ---------------------------------------------------------------------------
// Reducer unit tests
// ---------------------------------------------------------------------------

describe('chatReducer', () => {
  it('initial state has empty messages, isStreaming false, error null', () => {
    expect(initialState.messages).toEqual([]);
    expect(initialState.isStreaming).toBe(false);
    expect(initialState.error).toBeNull();
  });

  it('SEND_MESSAGE adds user message and empty assistant message', () => {
    const next = chatReducer(initialState, {
      type: 'SEND_MESSAGE',
      message: 'Hello',
    });
    expect(next.messages).toHaveLength(2);
    expect(next.messages[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(next.messages[1]).toEqual({ role: 'assistant', content: '' });
    expect(next.error).toBeNull();
  });

  it('STREAM_START sets isStreaming to true', () => {
    const withMessage = chatReducer(initialState, {
      type: 'SEND_MESSAGE',
      message: 'Hi',
    });
    const next = chatReducer(withMessage, { type: 'STREAM_START' });
    expect(next.isStreaming).toBe(true);
  });

  it('STREAM_DELTA appends content to last assistant message', () => {
    let state: ChatState = chatReducer(initialState, {
      type: 'SEND_MESSAGE',
      message: 'Hi',
    });
    state = chatReducer(state, { type: 'STREAM_START' });
    state = chatReducer(state, { type: 'STREAM_DELTA', content: 'Hello' });
    expect(state.messages[state.messages.length - 1].content).toBe('Hello');

    state = chatReducer(state, { type: 'STREAM_DELTA', content: ' world' });
    expect(state.messages[state.messages.length - 1].content).toBe(
      'Hello world'
    );
  });

  it('STREAM_DONE sets isStreaming false and attaches sources', () => {
    let state: ChatState = chatReducer(initialState, {
      type: 'SEND_MESSAGE',
      message: 'Hi',
    });
    state = chatReducer(state, { type: 'STREAM_START' });
    state = chatReducer(state, { type: 'STREAM_DELTA', content: 'Answer' });

    const sources = [{ title: 'Source 1', url: 'https://example.com' }];
    state = chatReducer(state, { type: 'STREAM_DONE', sources });

    expect(state.isStreaming).toBe(false);
    expect(state.messages[state.messages.length - 1].sources).toEqual(sources);
  });

  it('ERROR sets error message and isStreaming false', () => {
    let state: ChatState = chatReducer(initialState, {
      type: 'SEND_MESSAGE',
      message: 'Hi',
    });
    state = chatReducer(state, { type: 'STREAM_START' });
    state = chatReducer(state, {
      type: 'ERROR',
      message: 'Something failed',
    });

    expect(state.error).toBe('Something failed');
    expect(state.isStreaming).toBe(false);
  });

  it('RESET returns to initial state', () => {
    let state: ChatState = chatReducer(initialState, {
      type: 'SEND_MESSAGE',
      message: 'Hi',
    });
    state = chatReducer(state, {
      type: 'ERROR',
      message: 'fail',
    });
    state = chatReducer(state, { type: 'RESET' });

    expect(state).toEqual(initialState);
  });
});

// ---------------------------------------------------------------------------
// useChat hook tests
// ---------------------------------------------------------------------------

describe('useChat', () => {
  it('sendMessage is no-op when sessionId is null', async () => {
    const { result } = renderHook(() => useChat(null));

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(result.current.messages).toEqual([]);
  });
});
