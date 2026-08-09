/// <reference types="node" />

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, localMidnightUtc, offsetMinutesAt } from '../src/jobs/timezone';

test('New York offsets change across daylight saving time', () => {
  assert.equal(offsetMinutesAt(new Date('2026-10-31T12:00:00Z'), 'America/New_York'), -240);
  assert.equal(offsetMinutesAt(new Date('2026-11-02T12:00:00Z'), 'America/New_York'), -300);
});

test('local midnight windows are not hard-coded to a UTC hour', () => {
  const nov1 = localMidnightUtc(2026, 11, 1, 'America/New_York');
  const nov2 = localMidnightUtc(2026, 11, 2, 'America/New_York');

  assert.equal(nov1.toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(nov2.toISOString(), '2026-11-02T05:00:00.000Z');
  assert.equal((nov2.getTime() - nov1.getTime()) / 3_600_000, 25);
});

test('calendar date arithmetic crosses month boundaries', () => {
  assert.deepEqual(addDays(2026, 10, 31, 1), { year: 2026, month: 11, day: 1 });
});
