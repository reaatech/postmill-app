import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChannelMultiSelect } from './channel.multiselect';

const channels = [
  { integrationId: 'i1', name: 'Twitter', identifier: '@twitter', picture: '/tw.png' },
  { integrationId: 'i2', name: 'LinkedIn', identifier: 'linkedin', picture: '/li.png' },
  { integrationId: 'i3', name: 'Instagram', identifier: '@insta', picture: '/ig.png' },
];

describe('ChannelMultiSelect', () => {
  it('shows "All channels" when nothing is selected', () => {
    render(<ChannelMultiSelect channels={channels} selected={[]} onChange={() => {}} />);
    expect(screen.getByText('All channels')).toBeTruthy();
  });

  it('shows "All channels" when all are selected', () => {
    render(
      <ChannelMultiSelect
        channels={channels}
        selected={['i1', 'i2', 'i3']}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('All channels')).toBeTruthy();
  });

  it('shows channel name when only one is selected', () => {
    render(
      <ChannelMultiSelect
        channels={channels}
        selected={['i1']}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('Twitter')).toBeTruthy();
  });

  it('shows count when multiple channels are selected', () => {
    render(
      <ChannelMultiSelect
        channels={channels}
        selected={['i1', 'i2']}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('2 channels')).toBeTruthy();
  });

  it('opens dropdown and shows channel list', () => {
    const { container } = render(
      <ChannelMultiSelect channels={channels} selected={[]} onChange={() => {}} />
    );
    fireEvent.click(screen.getByText('All channels'));
    const menu = container.querySelector('.absolute');
    expect(menu).toBeTruthy();
    expect(menu!.textContent).toContain('Twitter');
    expect(menu!.textContent).toContain('LinkedIn');
    expect(menu!.textContent).toContain('Instagram');
  });

  it('calls onChange with all ids when select all is clicked', () => {
    const onChange = vi.fn();
    render(
      <ChannelMultiSelect channels={channels} selected={[]} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('All channels'));
    const allBtns = screen.getAllByText('All channels');
    fireEvent.click(allBtns[allBtns.length - 1]);
    expect(onChange).toHaveBeenCalledWith(['i1', 'i2', 'i3']);
  });

  it('calls onChange with selected channel id when channel is clicked', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChannelMultiSelect channels={channels} selected={[]} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('All channels'));
    const menu = container.querySelector('.absolute')!;
    const twitterBtn = Array.from(menu.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Twitter'
    )!;
    fireEvent.click(twitterBtn);
    expect(onChange).toHaveBeenCalledWith(['i1']);
  });

  it('deselects a channel when it is clicked again', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChannelMultiSelect
        channels={channels}
        selected={['i1', 'i2', 'i3']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText('All channels'));
    const menu = container.querySelector('.absolute')!;
    const twitterBtn = Array.from(menu.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Twitter'
    )!;
    fireEvent.click(twitterBtn);
    expect(onChange).toHaveBeenCalledWith(['i2', 'i3']);
  });

  it('calls onChange with empty array when deselect all is clicked', () => {
    const onChange = vi.fn();
    render(
      <ChannelMultiSelect
        channels={channels}
        selected={['i1', 'i2', 'i3']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText('All channels'));
    const allBtns = screen.getAllByText('All channels');
    fireEvent.click(allBtns[allBtns.length - 1]);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
