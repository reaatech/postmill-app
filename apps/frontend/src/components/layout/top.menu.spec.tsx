import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockIsGeneral = true;
let mockBillingEnabled = false;

vi.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ isGeneral: mockIsGeneral, billingEnabled: mockBillingEnabled }),
}));

const mockT = vi.fn((_key: string, fallback?: string) => fallback ?? _key);

vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockT,
}));

vi.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({
    id: 'test-user',
    orgId: 'test-org',
    role: 'USER',
    tier: 'PRO',
  }),
  ContextWrapper: ({ children }: any) => children,
}));

vi.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: vi.fn() }),
  ModalWrapper: ({ children }: any) => children,
}));

vi.mock('@gitroom/frontend/components/layout/agent.media.modal', () => ({
  AgentMediaModal: () => null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/schedule',
}));

import { TopMenu } from './top.menu';

describe('TopMenu', () => {
  describe('v3.8.3 Schedule rename', () => {
    beforeEach(() => {
      mockBillingEnabled = false;
    });

    it('in general mode, the menu item name should be "Schedule"', () => {
      mockIsGeneral = true;
      render(<TopMenu />);

      expect(screen.getByTitle('Schedule')).toBeDefined();
    });

    it('in general mode, the menu item path should be "/schedule"', () => {
      mockIsGeneral = true;
      render(<TopMenu />);

      const scheduleLink = screen.getByTitle('Schedule');
      expect(scheduleLink.getAttribute('href')).toBe('/schedule');
    });

    it('in non-general mode, the label should be "Launches"', () => {
      mockIsGeneral = false;
      render(<TopMenu />);

      expect(screen.getByTitle('Launches')).toBeDefined();
    });
  });
});
