import { condenseStrayLineBreaks, hasStrayLineBreaks } from '../utils/textCleanup';

describe('text cleanup helpers', () => {
  it('replaces mid-sentence line breaks with spaces', () => {
    expect(condenseStrayLineBreaks('One line\nwrapped here')).toBe('One line wrapped here');
  });

  it('keeps line breaks that sit next to a full stop', () => {
    expect(condenseStrayLineBreaks('Sentence one.\nSentence two')).toBe('Sentence one.\nSentence two');
    expect(condenseStrayLineBreaks('Sentence one\n.Sentence two')).toBe('Sentence one\n.Sentence two');
  });

  it('keeps paragraph breaks intact', () => {
    expect(condenseStrayLineBreaks('Paragraph one\n\nParagraph two')).toBe('Paragraph one\n\nParagraph two');
  });

  it('avoids creating duplicate spaces around removed line breaks', () => {
    expect(condenseStrayLineBreaks('Alpha \n beta')).toBe('Alpha beta');
  });

  it('detects when a field contains removable line breaks', () => {
    expect(hasStrayLineBreaks('Alpha\nbeta')).toBe(true);
    expect(hasStrayLineBreaks('Alpha.\nbeta')).toBe(false);
  });
});
