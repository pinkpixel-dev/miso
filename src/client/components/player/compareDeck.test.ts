import { describe, expect, it } from 'vitest';
import {
  applyFlip,
  correctDrift,
  pauseBoth,
  placeArrival,
  playBoth,
  seekBoth,
  type SyncedTake,
} from './compareDeck.ts';

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
    pause: () => {
      running = false;
      calls.push('pause()');
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

describe('placeArrival', () => {
  it('drops a second take into the moment the first one is at', () => {
    const other = fakeTake({ time: 42, playing: true });
    const arriving = fakeTake();

    placeArrival({ arriving: arriving.take, other: other.take, audible: false });

    expect(arriving.time()).toBe(42);
    expect(arriving.playing()).toBe(true);
  });

  it('arrives silent when the other side is the one being heard', () => {
    const other = fakeTake({ time: 42, playing: true });
    const arriving = fakeTake();

    placeArrival({ arriving: arriving.take, other: other.take, audible: false });

    expect(arriving.calls).toEqual(['setTime(42)', 'play()', 'setVolume(0)']);
  });

  it('arrives audible when it is the side being heard', () => {
    // Swapping the take on the side you are listening to. The new one takes
    // over at the same point rather than starting the song again.
    const other = fakeTake({ time: 42, playing: true });
    const arriving = fakeTake();

    placeArrival({ arriving: arriving.take, other: other.take, audible: true });

    expect(arriving.calls).toEqual(['setTime(42)', 'play()', 'setVolume(1)']);
  });

  it('sets the volume only after it has been moved', () => {
    const other = fakeTake({ time: 42, playing: true });
    const arriving = fakeTake();

    placeArrival({ arriving: arriving.take, other: other.take, audible: true });

    expect(arriving.calls.indexOf('setTime(42)')).toBeLessThan(
      arriving.calls.indexOf('setVolume(1)'),
    );
  });

  it('waits at the start when it is the first take picked', () => {
    const arriving = fakeTake();

    placeArrival({ arriving: arriving.take, other: undefined, audible: true });

    expect(arriving.calls).toEqual(['setVolume(1)']);
    expect(arriving.playing()).toBe(false);
  });

  it('does not start a take arriving next to a stopped one', () => {
    const other = fakeTake({ time: 42, playing: false });
    const arriving = fakeTake();

    placeArrival({ arriving: arriving.take, other: other.take, audible: false });

    expect(arriving.time()).toBe(42);
    expect(arriving.playing()).toBe(false);
  });

  it('parks at its own end when it is shorter than where the other side is', () => {
    const other = fakeTake({ time: 110, duration: 120, playing: true });
    const arriving = fakeTake({ duration: 94.76 });

    placeArrival({ arriving: arriving.take, other: other.take, audible: false });

    expect(arriving.time()).toBe(94.76);
    expect(arriving.playing()).toBe(false);
  });
});

describe('playBoth', () => {
  it('puts the silent side in step before either of them starts', () => {
    // A resume is the one moment correctDrift cannot cover, because it returns
    // early while the audible side is stopped.
    const audible = fakeTake({ time: 42, playing: false });
    const silent = fakeTake({ time: 12, playing: false });

    playBoth({ audible: audible.take, silent: silent.take });

    expect(silent.time()).toBe(42);
    expect(silent.playing()).toBe(true);
    expect(audible.playing()).toBe(true);
  });

  it('starts one take when only one is picked', () => {
    const audible = fakeTake({ time: 42 });

    playBoth({ audible: audible.take, silent: undefined });

    expect(audible.calls).toEqual(['play()']);
  });

  it('does not restart a side that is already running', () => {
    const audible = fakeTake({ time: 42, playing: true });
    const silent = fakeTake({ time: 42, playing: true });

    playBoth({ audible: audible.take, silent: silent.take });

    expect(audible.calls).not.toContain('play()');
    expect(silent.calls).not.toContain('play()');
  });

  it('leaves the shorter side stopped at its end', () => {
    const audible = fakeTake({ time: 110, duration: 120 });
    const silent = fakeTake({ time: 94.76, duration: 94.76 });

    playBoth({ audible: audible.take, silent: silent.take });

    expect(silent.playing()).toBe(false);
    expect(audible.playing()).toBe(true);
  });
});

describe('pauseBoth', () => {
  it('stops both sides, so neither creeps past the other', () => {
    const audible = fakeTake({ playing: true });
    const silent = fakeTake({ playing: true });

    pauseBoth({ audible: audible.take, silent: silent.take });

    expect(audible.playing()).toBe(false);
    expect(silent.playing()).toBe(false);
  });

  it('copes with only one side picked', () => {
    const audible = fakeTake({ playing: true });

    pauseBoth({ audible: audible.take, silent: undefined });

    expect(audible.calls).toEqual(['pause()']);
  });
});

describe('seekBoth', () => {
  it('moves both sides to the same moment', () => {
    const audible = fakeTake({ time: 0, duration: 120 });
    const silent = fakeTake({ time: 0, duration: 120 });

    seekBoth({ audible: audible.take, silent: silent.take, seconds: 42 });

    expect(audible.time()).toBe(42);
    expect(silent.time()).toBe(42);
  });

  it('clamps each side against its own length', () => {
    const audible = fakeTake({ time: 0, duration: 120 });
    const silent = fakeTake({ time: 0, duration: 94.76 });

    seekBoth({ audible: audible.take, silent: silent.take, seconds: 110 });

    expect(audible.time()).toBe(110);
    expect(silent.time()).toBe(94.76);
  });

  it('treats a scrub before the start as the start', () => {
    const audible = fakeTake({ time: 30, duration: 120 });

    seekBoth({ audible: audible.take, silent: undefined, seconds: -4 });

    expect(audible.time()).toBe(0);
  });
});
