import { describe, expect, it } from 'vitest';
import { SHORTCUTS, isTyping, shouldFire, usesSpace, type ShortcutId } from './shortcuts.ts';

function entry(id: ShortcutId) {
  const found = SHORTCUTS.find((s) => s.id === id);
  if (!found) throw new Error(id);
  return found;
}

/** A keydown close enough to the real thing for the rules being tested. */
function press(init: {
  key: string;
  target?: unknown;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  repeat?: boolean;
  prevented?: boolean;
}): KeyboardEvent {
  return {
    key: init.key,
    target: init.target ?? null,
    metaKey: init.meta ?? false,
    ctrlKey: init.ctrl ?? false,
    shiftKey: init.shift ?? false,
    altKey: init.alt ?? false,
    repeat: init.repeat ?? false,
    defaultPrevented: init.prevented ?? false,
  } as KeyboardEvent;
}

/** Enough of a focused element for the focus rules, with no DOM to build one. */
function element(tag: string, attrs: Record<string, string> = {}): EventTarget {
  return {
    tagName: tag.toUpperCase(),
    type: attrs.type,
    isContentEditable: attrs.contenteditable === 'true',
    getAttribute: (name: string) => attrs[name] ?? null,
  } as unknown as EventTarget;
}

describe('what counts as typing', () => {
  it('is true for the places text goes', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isTyping(element(tag))).toBe(true);
    }
  });

  it('is false for a plain division', () => {
    expect(isTyping(element('div'))).toBe(false);
  });

  it('is true for anything made editable', () => {
    expect(isTyping(element('div', { contenteditable: 'true' }))).toBe(true);
  });
});

describe('what already uses space', () => {
  it('leaves buttons, links and summaries alone', () => {
    for (const tag of ['button', 'a', 'summary']) {
      expect(usesSpace(element(tag))).toBe(true);
    }
  });

  it('leaves anything acting as a button alone', () => {
    expect(usesSpace(element('div', { role: 'button' }))).toBe(true);
  });

  it('leaves a checkbox alone but not a text box', () => {
    expect(usesSpace(element('input', { type: 'checkbox' }))).toBe(true);
    expect(usesSpace(element('input', { type: 'text' }))).toBe(false);
  });
});

describe('play and pause on space', () => {
  const play = entry('playPause');

  it('fires on a bare space', () => {
    expect(shouldFire(play, press({ key: ' ' }))).toBe(true);
  });

  it('does not fire while somebody is typing', () => {
    expect(shouldFire(play, press({ key: ' ', target: element('textarea') }))).toBe(false);
  });

  it('does not steal space from a focused button', () => {
    expect(shouldFire(play, press({ key: ' ', target: element('button') }))).toBe(false);
  });

  it('does not fire when a modifier is held', () => {
    expect(shouldFire(play, press({ key: ' ', meta: true }))).toBe(false);
    expect(shouldFire(play, press({ key: ' ', ctrl: true }))).toBe(false);
  });

  it('does not repeat while the key is held down', () => {
    // Holding space would otherwise toggle playback dozens of times a second.
    expect(shouldFire(play, press({ key: ' ', repeat: true }))).toBe(false);
  });

  it('leaves an event something else already handled', () => {
    expect(shouldFire(play, press({ key: ' ', prevented: true }))).toBe(false);
  });
});

describe('generate without leaving the prompt', () => {
  const generate = entry('generate');

  it('fires from inside the prompt box, which is the whole point', () => {
    expect(shouldFire(generate, press({ key: 'Enter', meta: true, target: element('textarea') }))).toBe(
      true,
    );
    expect(shouldFire(generate, press({ key: 'Enter', ctrl: true, target: element('textarea') }))).toBe(
      true,
    );
  });

  it('does not fire on a bare enter, which is a newline', () => {
    expect(shouldFire(generate, press({ key: 'Enter', target: element('textarea') }))).toBe(false);
  });
});

describe('flip on compare', () => {
  const flip = entry('flipCompare');

  it('fires on either case of the letter', () => {
    expect(shouldFire(flip, press({ key: 'f' }))).toBe(true);
    expect(shouldFire(flip, press({ key: 'F' }))).toBe(true);
  });

  it('does not fire while typing an f into a prompt', () => {
    expect(shouldFire(flip, press({ key: 'f', target: element('input') }))).toBe(false);
  });

  it('may repeat, because holding it is a way to audition the switch', () => {
    expect(shouldFire(flip, press({ key: 'f', repeat: true }))).toBe(true);
  });
});

describe('the table itself', () => {
  it('describes every shortcut it can run', () => {
    // The help dialog is built from this. An entry with no label or no place it
    // applies would render as a blank row.
    for (const s of SHORTCUTS) {
      expect(s.keys).not.toBe('');
      expect(s.label).not.toBe('');
      expect(s.where).not.toBe('');
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
  });
});
