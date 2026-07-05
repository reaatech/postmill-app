import React, { FC, useEffect } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// The bridge module imports `useCopilotReadable`; stub it so the pure
// context-store functions can be tested without a CopilotKit provider.
vi.mock('@copilotkit/react-core', () => ({
  useCopilotReadable: () => undefined,
}));

import {
  getAgentUiContext,
  setAgentUiContext,
  pushAgentUiContext,
} from './agent-context-bridge';

// A minimal producer, mirroring how launches / campaigns / post-detail wire the
// bridge: push on mount, return the disposer so it clears on unmount.
const Producer: FC<{ ctx: Parameters<typeof pushAgentUiContext>[0] }> = ({ ctx }) => {
  useEffect(() => pushAgentUiContext(ctx), [ctx]);
  return null;
};

describe('agent-context-bridge', () => {
  beforeEach(() => {
    cleanup();
    setAgentUiContext({});
  });

  it('merges pushed keys and removes only its own keys on dispose', () => {
    const dispose = pushAgentUiContext({ view: 'launches', calendarWeek: 'wk' });
    expect(getAgentUiContext()).toEqual({ view: 'launches', calendarWeek: 'wk' });
    dispose();
    expect(getAgentUiContext()).toEqual({});
  });

  it('lets two producers coexist; unmounting one keeps the other', () => {
    const disposeLaunches = pushAgentUiContext({
      view: 'launches',
      visiblePostIds: ['p1'],
    });
    const disposeModal = pushAgentUiContext({ currentPostId: 'p1' });
    expect(getAgentUiContext()).toEqual({
      view: 'launches',
      visiblePostIds: ['p1'],
      currentPostId: 'p1',
    });

    // Post-detail modal closes: only its key must go, not the launches keys.
    disposeModal();
    expect(getAgentUiContext()).toEqual({
      view: 'launches',
      visiblePostIds: ['p1'],
    });

    disposeLaunches();
    expect(getAgentUiContext()).toEqual({});
  });

  it('updates the bridge value when a producer mounts and clears on unmount', () => {
    const { unmount } = render(<Producer ctx={{ selectedCampaignId: 'c1' }} />);
    expect(getAgentUiContext()).toEqual({ selectedCampaignId: 'c1' });
    unmount();
    expect(getAgentUiContext()).toEqual({});
  });
});
