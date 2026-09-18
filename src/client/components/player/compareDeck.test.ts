import { describe, expect, it } from 'vitest';
import { applyFlip, correctDrift, type SyncedTake } from './compareDeck.ts';

/**
 * A take that records what was done to it.
 *
 * Small on purpose. Both functions under test are a handful of wavesurfer calls
 * in an order that matters, so what is worth asserting is the calls and the
 * order, not a rendered waveform.
 */
function fakeTake({
  time = 0,
  duration = 94.76,
  playing = false,
}: {
  time?: number;
  duration?: number;
  playing?: boolean;
} = {}) {
  const calls: string[] = [];
  let at = time;
  let running = playing;

  const take: SyncedTake = {
    getCurrentTime: () => at,
    getDuration: () => duration,
    isPlaying: () => running,
    setTime: (seconds) => {
      at = seconds;
      calls.push(`setTime(${seconds})`);
    },
    setVolume: (volume) => {
      calls.push(`setVolume(${volume})`);
    },
    play: async () => {
      running = true;
      calls.push('play()');
    },
  };

  return { take, calls, time: () => at, playing: () => running };
}

describe('applyFlip', () => {
  it('lands the arriving take where the leaving one was and makes it the audible one', () => {
    const leaving = fakeTake({ time: 42, playing: true });
    const arriving = fakeTake();

    applyFlip({ leaving: leaving.take, arriving: arriving.take });

    expect(arriving.time()).toBe(42);
    expect(arriving.calls).toEqual(['setTime(42)', 'setVolume(1)', 'play()']);
    expect(leaving.calls).toEqual(['setVolume(0)']);
  });

  it('moves the arriving take before either volume changes', () => {
    // A volume raised before the seek is a moment of the wrong position at full
    // volume, which is audible as a jump.
    const leaving = fakeTake({ time: 42, playing: true });
    const arriving = fakeTake();

    applyFlip({ leaving: leaving.take, arriving: arriving.take });

    expect(arriving.calls.indexOf('setTime(42)')).toBeLessThan(
      arriving.calls.indexOf('setVolume(1)'),
    );
  });

  it('does not start the arriving take when the leaving one was stopped', () => {
    const leaving = fakeTake({ time: 42, playing: false });
    const arriving = fakeTake();

    applyFlip({ leaving: leaving.take, arriving: arriving.take });

    expect(arriving.playing()).toBe(false);
    expect(arriving.calls).toEqual(['setTime(42)', 'setVolume(1)']);
  });

  it('flips silently rather than restarting a take that is already running', () => {
    // Both sides run the whole time a pair is armed, so the arriving side is
    // normally already playing. Calling play again would be a second start.
    const leaving = fakeTake({ time: 42, playing: true });
    const arriving = fakeTake({ time: 42, playing: true });

    applyFlip({ leaving: leaving.take, arriving: arriving.take });

    expect(arriving.calls).not.toContain('play()');
    expect(arriving.calls).toContain('setVolume(1)');
  });

  it('parks at the end without playing when the arriving take is the shorter one', () => {
    // The real pair measured on September 17, 2026: a 94.78 source and a 94.76
    // repaint. A flip in that last fraction has nowhere to go.
    const leaving = fakeTake({ time: 94.78, duration: 94.78, playing: true });
    const arriving = fakeTake({ duration: 94.76 });

    applyFlip({ leaving: leaving.take, arriving: arriving.take });

    expect(arriving.time()).toBe(94.76);
    expect(arriving.playing()).toBe(false);
  });

  it('still hands over the audible side when the arriving take cannot play', () => {
    // Whatever else happens, exactly one side is audible when this returns.
    const leaving = fakeTake({ time: 94.78, duration: 94.78, playing: true });
    const arriving = fakeTake({ duration: 94.76 });

    applyFlip({ leaving: leaving.take, arriving: arriving.take });

    expect(arriving.calls).toContain('setVolume(1)');
    expect(leaving.calls).toEqual(['setVolume(0)']);
  });
});

describe('correctDrift', () => {
  it('moves the silent side back when it has slipped', () => {
    const audible = fakeTake({ time: 30.4, playing: true });
    const silent = fakeTake({ time: 30, playing: true });

    expect(correctDrift({ audible: audible.take, silent: silent.take })).toBe(true);
    expect(silent.time()).toBe(30.4);
  });

  it('leaves a gap nobody can hear alone', () => {
    const audible = fakeTake({ time: 30.01, playing: true });
    const silent = fakeTake({ time: 30, playing: true });

    expect(correctDrift({ audible: audible.take, silent: silent.take })).toBe(false);
    expect(silent.calls).toEqual([]);
  });

  it('does nothing while the audible side is stopped', () => {
    // Two stopped takes cannot drift, and a correction under a stopped player
    // only shows up as a jump on the next press.
    const audible = fakeTake({ time: 30, playing: false });
    const silent = fakeTake({ time: 12, playing: false });

    expect(correctDrift({ audible: audible.take, silent: silent.take })).toBe(false);
    expect(silent.calls).toEqual([]);
  });

  it('never touches the side you can hear', () => {
    const audible = fakeTake({ time: 30.4, playing: true });
    const silent = fakeTake({ time: 30, playing: true });

    correctDrift({ audible: audible.take, silent: silent.take });

    expect(audible.calls).toEqual([]);
  });

  it('starts the silent side again if it had run out and the audible one had not', () => {
    const audible = fakeTake({ time: 40, duration: 120, playing: true });
    const silent = fakeTake({ time: 94.76, duration: 94.76, playing: false });

    expect(correctDrift({ audible: audible.take, silent: silent.take })).toBe(true);
    expect(silent.time()).toBe(40);
    expect(silent.playing()).toBe(true);
  });

  it('parks the silent side at its end rather than seeking past it', () => {
    // Two takes picked by hand can differ in length by any amount, so the
    // shorter one simply ends first and stays there.
    const audible = fakeTake({ time: 110, duration: 120, playing: true });
    const silent = fakeTake({ time: 60, duration: 94.76, playing: true });

    expect(correctDrift({ audible: audible.take, silent: silent.take })).toBe(true);
    expect(silent.time()).toBe(94.76);
  });
});
