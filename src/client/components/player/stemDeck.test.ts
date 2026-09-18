import { describe, expect, it } from 'vitest';
import type { SyncedTake } from './compareDeck.ts';
import {
  DEFAULT_CONTROLS,
  anySoloed,
  applyGains,
  correctFollowers,
  gainFor,
  gainsFor,
  isOnlySolo,
  pauseAll,
  placeStem,
  playAll,
  seekAll,
  soloOnly,
  type StemControls,
} from './stemDeck.ts';

/** A stem that records what was done to it. Same shape the compare deck tests use. */
function fakeTake({
  time = 0,
  duration = 180,
  playing = false,
}: { time?: number; duration?: number; playing?: boolean } = {}) {
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

function controls(patch: Partial<StemControls> = {}): StemControls {
  return { ...DEFAULT_CONTROLS, ...patch };
}

describe('gainFor', () => {
  it('plays an ordinary stem at its fader', () => {
    expect(gainFor(controls({ volume: 0.6 }), false)).toBe(0.6);
  });

  it('silences a muted stem', () => {
    expect(gainFor(controls({ muted: true }), false)).toBe(0);
  });

  it('silences everything that is not soloed', () => {
    expect(gainFor(controls(), true)).toBe(0);
  });

  it('plays a soloed stem even when it is also muted', () => {
    // Solo wins in both directions, which is what makes releasing the last
    // solo put the previous mutes back rather than having thrown them away.
    expect(gainFor(controls({ soloed: true, muted: true }), true)).toBe(1);
  });

  it('keeps the fader on a soloed stem', () => {
    expect(gainFor(controls({ soloed: true, volume: 0.3 }), true)).toBe(0.3);
  });

  it('clamps a fader that left the range', () => {
    expect(gainFor(controls({ volume: 4 }), false)).toBe(1);
    expect(gainFor(controls({ volume: -2 }), false)).toBe(0);
    expect(gainFor(controls({ volume: Number.NaN }), false)).toBe(0);
  });
});

describe('anySoloed', () => {
  it('is false for a set with no solos', () => {
    expect(anySoloed([controls(), controls({ muted: true })])).toBe(false);
  });

  it('is true as soon as one is soloed', () => {
    expect(anySoloed([controls(), controls({ soloed: true })])).toBe(true);
  });
});

describe('gainsFor', () => {
  it('asks the solo question once for the whole set', () => {
    const gains = gainsFor(
      new Map([
        ['vocals', controls({ soloed: true })],
        ['drums', controls()],
        ['bass', controls({ muted: true })],
        ['other', controls({ volume: 0.5 })],
      ]),
    );

    expect(gains.get('vocals')).toBe(1);
    expect(gains.get('drums')).toBe(0);
    expect(gains.get('bass')).toBe(0);
    expect(gains.get('other')).toBe(0);
  });

  it('restores the mutes when the last solo is released', () => {
    const before = gainsFor(
      new Map([
        ['vocals', controls({ muted: true })],
        ['drums', controls({ volume: 0.5 })],
      ]),
    );

    expect(before.get('vocals')).toBe(0);
    expect(before.get('drums')).toBe(0.5);
  });
});

describe('applyGains', () => {
  it('only touches the stems that are loaded', () => {
    const vocals = fakeTake();
    const takes = new Map<string, SyncedTake>([['vocals', vocals.take]]);

    applyGains(
      takes,
      new Map([
        ['vocals', controls({ volume: 0.4 })],
        ['drums', controls()],
      ]),
    );

    expect(vocals.calls).toEqual(['setVolume(0.4)']);
  });
});

describe('playAll', () => {
  it('puts the followers in step before anything starts', () => {
    // Four stems left at four slightly different positions and started
    // together is a mix that is out by a few hundredths of a second.
    const leader = fakeTake({ time: 30 });
    const follower = fakeTake({ time: 29.7 });

    playAll({ leader: leader.take, followers: [follower.take] });

    expect(follower.calls).toEqual(['setTime(30)', 'play()']);
    expect(leader.calls).toEqual(['play()']);
  });

  it('does not restart a stem that is already running', () => {
    const leader = fakeTake({ time: 10, playing: true });
    const follower = fakeTake({ time: 10, playing: true });

    playAll({ leader: leader.take, followers: [follower.take] });

    expect(leader.calls).toEqual([]);
    expect(follower.calls).toEqual(['setTime(10)']);
  });
});

describe('pauseAll', () => {
  it('stops every stem', () => {
    const one = fakeTake({ playing: true });
    const two = fakeTake({ playing: true });

    pauseAll([one.take, two.take]);

    expect(one.playing()).toBe(false);
    expect(two.playing()).toBe(false);
  });
});

describe('seekAll', () => {
  it('moves every stem to the same moment', () => {
    const one = fakeTake();
    const two = fakeTake();

    seekAll([one.take, two.take], 45);

    expect(one.time()).toBe(45);
    expect(two.time()).toBe(45);
  });

  it('clamps against each stem rather than a shared length', () => {
    const shorter = fakeTake({ duration: 20 });

    seekAll([shorter.take], 45);

    expect(shorter.time()).toBe(20);
  });
});

describe('correctFollowers', () => {
  it('does nothing while the leader is stopped', () => {
    const leader = fakeTake({ time: 30 });
    const follower = fakeTake({ time: 12 });

    expect(correctFollowers({ leader: leader.take, followers: [follower.take] })).toBe(0);
    expect(follower.calls).toEqual([]);
  });

  it('leaves a stem that is close enough alone', () => {
    const leader = fakeTake({ time: 30, playing: true });
    const follower = fakeTake({ time: 30.01, playing: true });

    expect(correctFollowers({ leader: leader.take, followers: [follower.take] })).toBe(0);
    expect(follower.calls).toEqual([]);
  });

  it('moves only the stems that slipped', () => {
    const leader = fakeTake({ time: 30, playing: true });
    const close = fakeTake({ time: 30.01, playing: true });
    const adrift = fakeTake({ time: 28, playing: true });

    expect(
      correctFollowers({ leader: leader.take, followers: [close.take, adrift.take] }),
    ).toBe(1);
    expect(close.calls).toEqual([]);
    expect(adrift.calls).toEqual(['setTime(30)']);
  });
});

describe('placeStem', () => {
  it('lands a late stem where the others already are', () => {
    const leader = fakeTake({ time: 62, playing: true });
    const arriving = fakeTake();

    placeStem({ arriving: arriving.take, leader: leader.take, gain: 1 });

    expect(arriving.calls).toEqual(['setTime(62)', 'play()', 'setVolume(1)']);
  });

  it('sets the volume after the seek', () => {
    const leader = fakeTake({ time: 62, playing: true });
    const arriving = fakeTake();

    placeStem({ arriving: arriving.take, leader: leader.take, gain: 0.5 });

    expect(arriving.calls.indexOf('setTime(62)')).toBeLessThan(
      arriving.calls.indexOf('setVolume(0.5)'),
    );
  });

  it('waits at the start when it is the first stem loaded', () => {
    const arriving = fakeTake();

    placeStem({ arriving: arriving.take, leader: undefined, gain: 1 });

    expect(arriving.calls).toEqual(['setVolume(1)']);
  });

  it('does not start a stem when the others are paused', () => {
    const leader = fakeTake({ time: 62 });
    const arriving = fakeTake();

    placeStem({ arriving: arriving.take, leader: leader.take, gain: 0 });

    expect(arriving.calls).toEqual(['setTime(62)', 'setVolume(0)']);
  });
});

describe('soloOnly', () => {
  it('solos one stem and releases the rest', () => {
    const before = new Map([
      ['vocals', controls({ soloed: true })],
      ['drums', controls({ soloed: true })],
      ['bass', controls()],
    ]);

    const after = soloOnly(before, 'bass');

    expect(after.get('vocals')?.soloed).toBe(false);
    expect(after.get('drums')?.soloed).toBe(false);
    expect(after.get('bass')?.soloed).toBe(true);
  });

  it('leaves mutes and faders alone', () => {
    // Solo overrides a mute while it is on and gives it back when released,
    // so pressing play on one stem must not throw the mute away.
    const before = new Map([['vocals', controls({ muted: true, volume: 0.4 })]]);

    const after = soloOnly(before, 'vocals');

    expect(after.get('vocals')?.muted).toBe(true);
    expect(after.get('vocals')?.volume).toBe(0.4);
  });

  it('makes that stem the only thing you hear', () => {
    const gains = gainsFor(
      soloOnly(
        new Map([
          ['vocals', controls()],
          ['drums', controls()],
        ]),
        'drums',
      ),
    );

    expect(gains.get('vocals')).toBe(0);
    expect(gains.get('drums')).toBe(1);
  });

  it('does not change a map it was given', () => {
    const before = new Map([['vocals', controls()]]);
    soloOnly(before, 'vocals');
    expect(before.get('vocals')?.soloed).toBe(false);
  });
});

describe('isOnlySolo', () => {
  it('is true when this stem is the only one soloed', () => {
    const map = new Map([
      ['vocals', controls({ soloed: true })],
      ['drums', controls()],
    ]);

    expect(isOnlySolo(map, 'vocals')).toBe(true);
    expect(isOnlySolo(map, 'drums')).toBe(false);
  });

  it('is false when something else is soloed too', () => {
    const map = new Map([
      ['vocals', controls({ soloed: true })],
      ['drums', controls({ soloed: true })],
    ]);

    expect(isOnlySolo(map, 'vocals')).toBe(false);
  });

  it('is false when nothing is soloed', () => {
    expect(isOnlySolo(new Map([['vocals', controls()]]), 'vocals')).toBe(false);
  });
});
