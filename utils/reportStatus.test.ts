import { describe, expect, it } from '@jest/globals';

import { resolveReportStatusForSave } from './reportStatus';

describe('mobile report save status', () => {
  it('keeps saved drafts as drafts', () => {
    expect(resolveReportStatusForSave('draft')).toBe('draft');
  });

  it('makes an explicit technician submission completed', () => {
    expect(resolveReportStatusForSave('submit')).toBe('completed');
  });
});
