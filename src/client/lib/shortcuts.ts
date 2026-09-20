import { useEffect, useRef } from 'react';

/**
 * Every keyboard shortcut Miso has, in one place.
 *
 * The list and the handlers come from the same table on purpose. A help dialog
 * built from a second hand-written list is a dialog that goes out of date the
 * first time a key changes, and a wrong shortcut list is worse than none.
 *
 * Three rules this table encodes, all of them about not stealing keys:
 *
 * Nothing fires while somebody is typing, unless the shortcut says otherwise.
 * Half this application is a lyrics editor and a prompt box, so a bare letter
 * key that worked everywhere would be unusable.
 *
 * Space does not fire when the focused thing is something Space already
 * operates. A focused button activates on Space, and a play shortcut that
 * swallowed that would break every button on the page for keyboard users.
 *
 * The one shortcut that does work while typing is generate, because the whole
 * point of it is to send the prompt you are still writing.
 */

export type ShortcutId = 'playPause' | 'generate' | 'flipCompare' | 'help';

export interface Shortcut {
  id: ShortcutId;
  /** How the key is written for a person, used by the help dialog. */
  keys: string;
  /** What it does, phrased as an action. */
  label: string;
  /** Where it applies, so the dialog does not imply it works everywhere. */
  where: string;
  allowWhileTyping?: boolean;
  matches: (event: KeyboardEvent) => boolean;
}

/**
 * What the two focus rules below read off the focused element.
 *
 * Duck typed rather than `instanceof HTMLElement` so the rules can be tested
 * without a DOM. This project runs vitest in node and has no jsdom, and these
 * are the rules most worth covering, because every one of them is a key that
 * would otherwise be stolen from somebody. A real element satisfies this shape,
 * so the browser behaviour is unchanged.
 */
interface Focused {
  tagName?: unknown;
  type?: unknown;
  isContentEditable?: unknown;
  getAttribute?: (name: string) => string | null;
}

function focused(target: EventTarget | null): Focused | undefined {
  if (target === null || typeof target !== 'object') return undefined;
  return target as Focused;
}

/** True for anything the person is typing into. */
export function isTyping(target: EventTarget | null): boolean {
  const node = focused(target);
  if (!node) return false;
  if (node.isContentEditable === true) return true;
  return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT';
}

/**
 * True for controls the browser already operates with Space.
 *
 * Checked for the play shortcut alone. A focused button, link, summary or
 * checkbox has its own meaning for Space and keeps it.
 */
export function usesSpace(target: EventTarget | null): boolean {
  const node = focused(target);
  if (!node) return false;

  const tag = node.tagName;
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return true;
  if (node.getAttribute?.('role') === 'button') return true;
  if (tag === 'INPUT') return node.type === 'checkbox' || node.type === 'radio';
  return false;
}

/** No modifier held. A shortcut with a modifier says so itself. */
function bare(event: KeyboardEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey;
}

export const SHORTCUTS: Shortcut[] = [
  {
    id: 'playPause',
    keys: 'Space',
    label: 'Play or pause the take in the player',
    where: 'Anywhere',
    matches: (event) =>
      event.key === ' ' && bare(event) && !event.shiftKey && !usesSpace(event.target),
  },
  {
    id: 'generate',
    keys: 'Ctrl or Cmd, Enter',
    label: 'Generate, without leaving the prompt',
    where: 'Anywhere a prompt is being written',
    allowWhileTyping: true,
    matches: (event) => event.key === 'Enter' && (event.metaKey || event.ctrlKey),
  },
  {
    id: 'flipCompare',
    keys: 'F',
    label: 'Flip between the two takes',
    where: 'Compare',
    matches: (event) => event.key.toLowerCase() === 'f' && bare(event),
  },
  {
    id: 'help',
    keys: '?',
    label: 'Show this list',
    where: 'Anywhere',
    matches: (event) => event.key === '?' && !event.metaKey && !event.ctrlKey,
  },
];

function shortcut(id: ShortcutId): Shortcut {
  const found = SHORTCUTS.find((entry) => entry.id === id);
  if (!found) throw new Error(`No shortcut called ${id}`);
  return found;
}

/**
 * Decides whether one event should run one shortcut.
 *
 * Exported for its own test. Every rule about what does not fire lives here,
 * and every one of them is a rule somebody will otherwise rediscover by having
 * a key stolen from them.
 */
export function shouldFire(entry: Shortcut, event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return false;
  if (event.repeat && entry.id !== 'flipCompare') return false;
  if (isTyping(event.target) && !entry.allowWhileTyping) return false;
  return entry.matches(event);
}

/**
 * Runs `handler` when this shortcut fires, while `enabled`.
 *
 * The handler is read from a ref rather than closed over, so a component that
 * rebuilds it on every render does not add and remove a window listener on
 * every render with it.
 */
export function useShortcut(id: ShortcutId, handler: () => void, enabled = true): void {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const entry = shortcut(id);

    function onKeyDown(event: KeyboardEvent) {
      if (!shouldFire(entry, event)) return;
      event.preventDefault();
      latest.current();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [id, enabled]);
}
