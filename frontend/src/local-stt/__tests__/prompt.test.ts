import { describe, expect, it } from 'vitest';

import { transcriptForPrompt } from '../prompt';

describe('transcriptForPrompt', () => {
  it('inserts the recognized transcript as the prompt text', () => {
    expect(transcriptForPrompt('  Explain pull requests  ')).toBe(
      'Explain pull requests',
    );
  });

  it('rejects an empty transcript', () => {
    expect(() => transcriptForPrompt('   ')).toThrow('returned no text');
  });
});
