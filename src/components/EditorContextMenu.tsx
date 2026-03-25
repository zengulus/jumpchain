import { useEffect, useMemo, useRef, useState } from 'react';
import { condenseStrayLineBreaks, hasStrayLineBreaks } from '../utils/textCleanup';

interface MenuState {
  x: number;
  y: number;
  target: HTMLTextAreaElement;
}

function isPlainTextEditorTarget(target: EventTarget | null): target is HTMLTextAreaElement {
  return (
    target instanceof HTMLTextAreaElement &&
    !target.disabled &&
    !target.readOnly &&
    !target.classList.contains('json-editor')
  );
}

function setNativeTextareaValue(target: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

  if (valueSetter) {
    valueSetter.call(target, value);
  } else {
    target.value = value;
  }

  target.dispatchEvent(new Event('input', { bubbles: true }));
}

function replaceTextareaRange(target: HTMLTextAreaElement, start: number, end: number, replacement: string) {
  const nextValue = `${target.value.slice(0, start)}${replacement}${target.value.slice(end)}`;
  setNativeTextareaValue(target, nextValue);

  requestAnimationFrame(() => {
    target.focus();
    target.setSelectionRange(start, start + replacement.length);
  });
}

export function EditorContextMenu() {
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleContextMenu(event: MouseEvent) {
      if (!isPlainTextEditorTarget(event.target)) {
        setMenuState(null);
        return;
      }

      event.preventDefault();
      setMenuState({
        x: Math.min(event.clientX, window.innerWidth - 260),
        y: Math.min(event.clientY, window.innerHeight - 220),
        target: event.target,
      });
    }

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setMenuState(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuState(null);
      }
    }

    function handleViewportChange() {
      setMenuState(null);
    }

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, []);

  const selectionDetails = useMemo(() => {
    if (!menuState) {
      return null;
    }

    const selectionStart = menuState.target.selectionStart ?? 0;
    const selectionEnd = menuState.target.selectionEnd ?? selectionStart;
    const hasSelection = selectionEnd > selectionStart;
    const selectedText = hasSelection ? menuState.target.value.slice(selectionStart, selectionEnd) : '';

    return {
      selectionStart,
      selectionEnd,
      hasSelection,
      selectedText,
      selectionHasStrayLineBreaks: hasSelection && hasStrayLineBreaks(selectedText),
      fieldHasStrayLineBreaks: hasStrayLineBreaks(menuState.target.value),
    };
  }, [menuState]);

  if (!menuState || !selectionDetails) {
    return null;
  }

  function closeMenu() {
    setMenuState(null);
  }

  function handleCondenseSelection() {
    const { selectionStart, selectionEnd, selectedText } = selectionDetails;
    replaceTextareaRange(menuState.target, selectionStart, selectionEnd, condenseStrayLineBreaks(selectedText));
    closeMenu();
  }

  function handleCondenseField() {
    const nextValue = condenseStrayLineBreaks(menuState.target.value);
    setNativeTextareaValue(menuState.target, nextValue);

    requestAnimationFrame(() => {
      menuState.target.focus();
      menuState.target.setSelectionRange(0, nextValue.length);
    });

    closeMenu();
  }

  function handleSelectAll() {
    menuState.target.focus();
    menuState.target.setSelectionRange(0, menuState.target.value.length);
    closeMenu();
  }

  return (
    <div
      ref={menuRef}
      className="editor-context-menu"
      role="menu"
      aria-label="Text tools"
      style={{
        left: `${menuState.x}px`,
        top: `${menuState.y}px`,
      }}
    >
      <div className="editor-context-menu__label">Text Tools</div>
      {selectionDetails.hasSelection ? (
        <button
          className="editor-context-menu__item"
          type="button"
          role="menuitem"
          onClick={handleCondenseSelection}
          disabled={!selectionDetails.selectionHasStrayLineBreaks}
        >
          Remove Stray Line Breaks in Selection
        </button>
      ) : null}
      <button
        className="editor-context-menu__item"
        type="button"
        role="menuitem"
        onClick={handleCondenseField}
        disabled={!selectionDetails.fieldHasStrayLineBreaks}
      >
        Remove Stray Line Breaks in Field
      </button>
      <button className="editor-context-menu__item" type="button" role="menuitem" onClick={handleSelectAll}>
        Select All
      </button>
    </div>
  );
}
