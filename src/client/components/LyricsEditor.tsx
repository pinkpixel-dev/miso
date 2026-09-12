import { useRef } from 'react';
import { Button, TextArea } from './ui.tsx';

/**
 * The lyrics sheet.
 *
 * ACE-Step reads structure tags in the lyrics themselves, so the section
 * buttons are not decoration: they are how a person tells the model where the
 * chorus is. Each one drops its tag on a line of its own at the caret, and
 * leaves the caret after it so the next thing typed is the first line of that
 * section.
 *
 * The tags are inserted rather than templated, because a song is not always
 * verse chorus verse and a form that assumed so would be wrong more often than
 * it was helpful.
 */

const SECTIONS = ['[Intro]', '[Verse]', '[Pre-Chorus]', '[Chorus]', '[Bridge]', '[Outro]'];

export function LyricsEditor({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const area = useRef<HTMLTextAreaElement>(null);

  const insert = (tag: string) => {
    const element = area.current;

    // Without the element there is still a sensible answer: put it at the end.
    if (!element) {
      onChange(value === '' ? `${tag}\n` : `${value.replace(/\n*$/, '')}\n\n${tag}\n`);
      return;
    }

    const start = element.selectionStart;
    const end = element.selectionEnd;
    const before = value.slice(0, start);
    const after = value.slice(end);

    // A tag belongs on its own line with a blank line above it, unless it is
    // already at the start of one, or at the very start of an empty sheet.
    const lead = before === '' ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const trail = after.startsWith('\n') ? '' : '\n';
    const insertion = `${lead}${tag}${trail}`;

    onChange(`${before}${insertion}${after}`);

    // The caret goes after the tag and its newline, so typing carries straight
    // on into the section that was just opened.
    const caret = start + insertion.length;
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <TextArea
        ref={area}
        label={label}
        hint={hint}
        rows={10}
        disabled={disabled}
        placeholder={'[Verse]\nThe first line of the song'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="font-mono"
      />
      <div role="group" aria-label="Insert a section tag" className="flex flex-wrap gap-2">
        {SECTIONS.map((tag) => (
          <Button
            key={tag}
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => insert(tag)}
            className="min-h-11 font-mono text-xs"
          >
            {tag}
          </Button>
        ))}
      </div>
    </div>
  );
}
