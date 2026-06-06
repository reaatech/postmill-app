import { describe, it, expect, vi } from 'vitest';
import { ToolFirewallService, ToolFirewallBlocked } from './tool-firewall.service';

describe('ToolFirewallService', () => {
  it('allows ordinary tool calls by default', () => {
    const fw = new ToolFirewallService();
    expect(fw.check('schedulePost', { content: 'hello world' })).toEqual({ allowed: true });
  });

  it('blocks denied tools', () => {
    const fw = new ToolFirewallService();
    fw.configure({ deniedTools: ['deleteEverything'] });
    const v = fw.check('deleteEverything', {});
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/denied/);
  });

  it('enforces an allow-list when provided (allow-list wins)', () => {
    const fw = new ToolFirewallService();
    fw.configure({ allowedTools: ['schedulePost'] });
    expect(fw.check('schedulePost', {}).allowed).toBe(true);
    expect(fw.check('integrationSchema', {}).allowed).toBe(false);
  });

  it('rejects oversized input', () => {
    const fw = new ToolFirewallService();
    fw.configure({ maxInputBytes: 16 });
    const v = fw.check('schedulePost', { content: 'x'.repeat(1000) });
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/exceeds/);
  });

  it('rejects control characters smuggled into input (incl. NUL)', () => {
    const fw = new ToolFirewallService();
    const withNul = { content: `a${String.fromCharCode(0)}b` };
    const v = fw.check('schedulePost', withNul);
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/control characters/);
  });

  it('allows tab / newline / carriage-return (not blocked as control chars)', () => {
    const fw = new ToolFirewallService();
    expect(fw.check('schedulePost', { content: 'line1\n\tline2\r' }).allowed).toBe(true);
  });

  it('wrap() blocks a disallowed call before the tool executes', async () => {
    const fw = new ToolFirewallService();
    fw.configure({ deniedTools: ['danger'] });
    const inner = vi.fn().mockResolvedValue('ran');
    const wrapped = fw.wrap('danger', { execute: inner } as any);
    await expect(wrapped.execute!({ context: {} })).rejects.toBeInstanceOf(ToolFirewallBlocked);
    expect(inner).not.toHaveBeenCalled();
  });

  it('wrap() delegates to the original tool when allowed', async () => {
    const fw = new ToolFirewallService();
    const inner = vi.fn().mockResolvedValue('ran');
    const wrapped = fw.wrap('schedulePost', { execute: inner } as any);
    const out = await wrapped.execute!({ context: { content: 'ok' } });
    expect(out).toBe('ran');
    expect(inner).toHaveBeenCalledOnce();
  });

  it('wrap() leaves a tool without execute untouched', () => {
    const fw = new ToolFirewallService();
    const tool = { id: 'noop' } as any;
    expect(fw.wrap('noop', tool)).toBe(tool);
  });
});
