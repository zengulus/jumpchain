import { Fragment } from 'react';
import { highlightPatternForQuery } from './searchUtils';

export function SearchHighlight(props: { text: string; query: string }) {
  const pattern = highlightPatternForQuery(props.query);

  if (!pattern || props.text.length === 0) {
    return <>{props.text}</>;
  }

  const parts = props.text.split(pattern);

  return (
    <>
      {parts.map((part, index) => {
        if (part.length === 0) {
          return null;
        }

        const matches = pattern.test(part);
        pattern.lastIndex = 0;

        return matches ? (
          <mark className="search-highlight" key={`${part}-${index}`}>
            {part}
          </mark>
        ) : (
          <Fragment key={`${part}-${index}`}>{part}</Fragment>
        );
      })}
    </>
  );
}
