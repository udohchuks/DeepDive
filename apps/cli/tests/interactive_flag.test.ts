import { describe, it, expect } from 'vitest';
import { parseInteractiveFlag } from '../src/cli.js';

describe('parseInteractiveFlag', () => {
  it('extracts --interactive and -i, keeping positionals in order', () => {
    expect(parseInteractiveFlag(['--interactive', './ws', 'do it'])).toEqual({
      interactive: true,
      rest: ['./ws', 'do it'],
    });
    expect(parseInteractiveFlag(['./ws', '-i', 'do it'])).toEqual({
      interactive: true,
      rest: ['./ws', 'do it'],
    });
  });

  it('defaults to headless when the flag is absent', () => {
    expect(parseInteractiveFlag(['./ws', 'do it'])).toEqual({
      interactive: false,
      rest: ['./ws', 'do it'],
    });
  });

  it('never consumes a value: --interactive is a bare flag', () => {
    const { rest } = parseInteractiveFlag(['--interactive', './ws']);
    expect(rest).toEqual(['./ws']);
  });
});
