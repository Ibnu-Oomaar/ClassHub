import { describe, expect, it } from 'vitest';
import { firstName, greeting, ordinal } from './format';

describe('firstName', () => {
  it('uses the first word of an ordinary name', () => {
    expect(firstName('Abdirahman Ahmed Ali')).toBe('Abdirahman');
  });

  it('keeps a leading title with the name that follows it', () => {
    expect(firstName('Mr Hassan Warsame')).toBe('Mr Hassan');
    expect(firstName('Sheikh Omar Ali')).toBe('Sheikh Omar');
    expect(firstName('Dr. Amina Yusuf')).toBe('Dr. Amina');
  });

  it('does not treat a title that is the whole name as a first name plus a surname', () => {
    expect(firstName('Mr')).toBe('Mr');
  });

  it('copes with extra spaces and a single name', () => {
    expect(firstName('   Ismail   Nur ')).toBe('Ismail');
    expect(firstName('Bilal')).toBe('Bilal');
  });
});

describe('greeting', () => {
  it('follows the hour of the day', () => {
    expect(greeting(new Date(2026, 9, 28, 6))).toBe('Good morning');
    expect(greeting(new Date(2026, 9, 28, 14))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 9, 28, 20))).toBe('Good evening');
  });
});

describe('ordinal', () => {
  it('handles the teens and the usual endings', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th']);
  });
});
