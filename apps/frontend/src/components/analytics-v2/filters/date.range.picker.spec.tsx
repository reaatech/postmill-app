import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import dayjs from 'dayjs';
import { DateRangePicker } from './date.range.picker';

function fixedDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

describe('DateRangePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedDate(2024, 6, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all preset buttons', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker from="2024-05-16" to="2024-06-15" compare={true} onChange={onChange} />
    );
    expect(screen.getByText('7 days')).toBeTruthy();
    expect(screen.getByText('30 days')).toBeTruthy();
    expect(screen.getByText('90 days')).toBeTruthy();
    expect(screen.getByText('365 days')).toBeTruthy();
    expect(screen.getByText('MTD')).toBeTruthy();
    expect(screen.getByText('QTD')).toBeTruthy();
    expect(screen.getByText('YTD')).toBeTruthy();
    expect(screen.getByText('Custom')).toBeTruthy();
  });

  it('calls onChange with correct range when 7d preset clicked', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker from="2024-05-16" to="2024-06-15" compare={true} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('7 days'));
    const now = dayjs();
    const expectedFrom = now.subtract(7, 'day').format('YYYY-MM-DD');
    const expectedTo = now.format('YYYY-MM-DD');
    expect(onChange).toHaveBeenCalledWith({
      from: expectedFrom,
      to: expectedTo,
      compare: true,
    });
  });

  it('calls onChange with correct range when 30d preset clicked', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker from="2024-05-16" to="2024-06-15" compare={false} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('30 days'));
    const now = dayjs();
    expect(onChange).toHaveBeenCalledWith({
      from: now.subtract(30, 'day').format('YYYY-MM-DD'),
      to: now.format('YYYY-MM-DD'),
      compare: false,
    });
  });

  it('calls onChange with correct range when MTD preset clicked', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker from="2024-05-16" to="2024-06-15" compare={true} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('MTD'));
    const now = dayjs();
    expect(onChange).toHaveBeenCalledWith({
      from: now.startOf('month').format('YYYY-MM-DD'),
      to: now.format('YYYY-MM-DD'),
      compare: true,
    });
  });

  it('calls onChange with correct range when YTD preset clicked', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker from="2024-05-16" to="2024-06-15" compare={true} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('YTD'));
    const now = dayjs();
    expect(onChange).toHaveBeenCalledWith({
      from: now.startOf('year').format('YYYY-MM-DD'),
      to: now.format('YYYY-MM-DD'),
      compare: true,
    });
  });

  it('shows custom date inputs when Custom is clicked', () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateRangePicker from="2024-05-16" to="2024-06-15" compare={true} onChange={onChange} />
    );
    expect(container.querySelector('input[type="date"]')).toBeFalsy();
    fireEvent.click(screen.getByText('Custom'));
    const inputs = container.querySelectorAll('input[type="date"]');
    expect(inputs.length).toBe(2);
  });

  it('calls onChange when custom date changes', () => {
    const onChange = vi.fn();
    const { container } = render(
      <DateRangePicker from="2024-05-16" to="2024-06-15" compare={true} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('Custom'));
    const inputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(inputs[0], { target: { value: '2024-06-01' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('calls onChange when compare checkbox is toggled', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker from="2024-05-16" to="2024-06-15" compare={true} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('Compare'));
    expect(onChange).toHaveBeenCalledWith({
      from: '2024-05-16',
      to: '2024-06-15',
      compare: false,
    });
  });

  it('marks the currently active preset when from/to match', () => {
    const onChange = vi.fn();
    const now = dayjs();
    const from30 = now.subtract(30, 'day').format('YYYY-MM-DD');
    const to = now.format('YYYY-MM-DD');
    render(
      <DateRangePicker from={from30} to={to} compare={true} onChange={onChange} />
    );
    const btn = screen.getByText('30 days');
    expect(btn.className).toContain('bg-forth');
  });
});
