const FULL_STOP_CHARACTERS = new Set(['.', '…']);

function isInlineWhitespace(character: string | undefined) {
  return character === ' ' || character === '\t';
}

function findPreviousMeaningfulCharacter(text: string, startIndex: number) {
  for (let index = startIndex; index >= 0; index -= 1) {
    const character = text[index];

    if (!isInlineWhitespace(character)) {
      return character ?? null;
    }
  }

  return null;
}

function findNextMeaningfulCharacter(text: string, startIndex: number) {
  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];

    if (!isInlineWhitespace(character)) {
      return character ?? null;
    }
  }

  return null;
}

export function condenseStrayLineBreaks(text: string) {
  const normalizedText = text.replace(/\r\n?/g, '\n');
  let nextText = '';

  for (let index = 0; index < normalizedText.length; index += 1) {
    const character = normalizedText[index];

    if (character !== '\n') {
      nextText += character;
      continue;
    }

    const previousCharacter = normalizedText[index - 1];
    const nextCharacter = normalizedText[index + 1];

    if (previousCharacter === '\n' || nextCharacter === '\n') {
      nextText += '\n';
      continue;
    }

    const previousMeaningfulCharacter = findPreviousMeaningfulCharacter(normalizedText, index - 1);
    const nextMeaningfulCharacter = findNextMeaningfulCharacter(normalizedText, index + 1);
    const sitsNextToFullStop =
      (previousMeaningfulCharacter !== null && FULL_STOP_CHARACTERS.has(previousMeaningfulCharacter)) ||
      (nextMeaningfulCharacter !== null && FULL_STOP_CHARACTERS.has(nextMeaningfulCharacter));

    if (sitsNextToFullStop) {
      nextText += '\n';
      continue;
    }

    if (!isInlineWhitespace(nextText[nextText.length - 1]) && !isInlineWhitespace(nextCharacter)) {
      nextText += ' ';
    }
  }

  return nextText;
}

export function hasStrayLineBreaks(text: string) {
  const normalizedText = text.replace(/\r\n?/g, '\n');
  return condenseStrayLineBreaks(text) !== normalizedText;
}
