/// <reference types="node" />

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasFortyEightHoursNotice,
  openingHoursViolation,
  sessionEnd,
  sessionMinutes
} from '../src/bookingRules';

test('session durations include the intensive lunch hold', () => {
  assert.equal(sessionMinutes('short'), 45);
  assert.equal(sessionMinutes('standard'), 60);
  assert.equal(sessionMinutes('intensive'), 210);

  const start = new Date('2026-08-12T13:00:00Z');
  assert.equal(sessionEnd(start, 'intensive')?.toISOString(), '2026-08-12T16:30:00.000Z');
});

test('opening hours are evaluated in centre-local time', () => {
  const validStart = new Date('2026-08-12T11:00:00Z'); // 07:00 New York
  const validEnd = new Date('2026-08-12T11:45:00Z');
  assert.equal(openingHoursViolation(validStart, validEnd), null);

  const earlyStart = new Date('2026-08-12T10:59:00Z'); // 06:59 New York
  const earlyEnd = new Date('2026-08-12T11:44:00Z');
  assert.match(openingHoursViolation(earlyStart, earlyEnd) || '', /opening hours/);

  const sundayStart = new Date('2026-08-16T15:00:00Z'); // Sunday New York
  const sundayEnd = new Date('2026-08-16T16:00:00Z');
  assert.match(openingHoursViolation(sundayStart, sundayEnd) || '', /Sundays/);
});

test('coach booking notice is at least 48 absolute hours', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  assert.equal(hasFortyEightHoursNotice(new Date('2026-08-12T12:00:00Z'), now), true);
  assert.equal(hasFortyEightHoursNotice(new Date('2026-08-12T11:59:59Z'), now), false);
});
