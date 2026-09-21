import { describe, expect, it } from '@jest/globals';
import { resolveReportSubmittedAt } from './reportCompletion';

describe('report submission evidence', () => {
  const now = new Date('2026-09-21T07:30:00.000Z');
  it('records Submit as a true instant, independently of the service date', () => {
    expect(resolveReportSubmittedAt('submit', null, now)).toBe(now.toISOString());
    expect(resolveReportSubmittedAt('submit', { reportStatus: 'draft' }, now)).toBe(now.toISOString());
  });
  it('does not invent submission times for drafts or old completed reports', () => {
    expect(resolveReportSubmittedAt('draft', null, now)).toBeNull();
    expect(resolveReportSubmittedAt('submit', { reportStatus: 'completed' }, now)).toBeNull();
  });
  it('preserves first submission on edits', () => {
    const existing = { submittedAt: '2026-09-21T06:00:00.000Z', reportStatus: 'completed' };
    expect(resolveReportSubmittedAt('submit', existing, now)).toBe(existing.submittedAt);
    expect(resolveReportSubmittedAt('draft', existing, now)).toBe(existing.submittedAt);
  });
});
