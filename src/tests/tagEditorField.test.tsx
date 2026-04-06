import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TagEditorField } from '../features/workspace/shared';

function TagEditorProbe() {
  const [tags, setTags] = useState<string[]>([]);

  return (
    <div>
      <TagEditorField
        label="Tags"
        tags={tags}
        suggestions={['Archive', 'Garage', 'Support']}
        onChange={setTags}
      />
      <output data-testid="tag-output">{tags.join('|')}</output>
    </div>
  );
}

describe('TagEditorField', () => {
  it('adds multiple tags from one input commit', () => {
    render(<TagEditorProbe />);

    fireEvent.change(screen.getByPlaceholderText('Type a tag, then press Enter'), {
      target: { value: 'Archive, Garage' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Type a tag, then press Enter'), { key: 'Enter' });

    expect(screen.getByTestId('tag-output').textContent).toBe('Archive|Garage');
  });

  it('adds suggestion tags without duplicating selected tags', () => {
    render(<TagEditorProbe />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Garage' }));

    expect(screen.getByTestId('tag-output').textContent).toBe('Archive|Garage');
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
  });
});
