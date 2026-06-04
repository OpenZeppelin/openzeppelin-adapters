import { describe, expect, it } from 'vitest';

import { InvalidAmount } from '@openzeppelin/ui-types';

import { formatAmount, parseAmount } from '../amount';

describe('parseAmount', () => {
  it('parses a canonical base-unit string to bigint', () => {
    expect(parseAmount('1000000000000000000')).toBe(1000000000000000000n);
    expect(parseAmount('0')).toBe(0n);
  });

  it('round-trips with formatAmount', () => {
    const value = '123456789012345678901234567890';
    expect(formatAmount(parseAmount(value))).toBe(value);
  });

  it.each([
    ['', 'empty'],
    ['-1', 'negative'],
    ['+1', 'signed'],
    ['1.5', 'fractional'],
    ['1e18', 'scientific-notation'],
    ['1 000', 'whitespace'],
    ['0x10', 'not-an-integer'],
    ['abc', 'not-an-integer'],
  ])('rejects malformed input %p with InvalidAmount (%s)', (input, reason) => {
    expect(() => parseAmount(input)).toThrow(InvalidAmount);
    try {
      parseAmount(input);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAmount);
      expect((error as InvalidAmount).code).toBe('INVALID_AMOUNT');
      expect((error as InvalidAmount).reason).toBe(reason);
      expect((error as InvalidAmount).value).toBe(input);
    }
  });

  it('threads the contract address into the error context', () => {
    try {
      parseAmount('1.5', '0xabc');
    } catch (error) {
      expect((error as InvalidAmount).contractAddress).toBe('0xabc');
    }
  });
});

describe('formatAmount', () => {
  it('formats a non-negative bigint to a base-unit string', () => {
    expect(formatAmount(0n)).toBe('0');
    expect(formatAmount(42n)).toBe('42');
  });

  it('rejects negative bigint with InvalidAmount', () => {
    expect(() => formatAmount(-1n)).toThrow(InvalidAmount);
  });
});
