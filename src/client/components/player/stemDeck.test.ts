import { describe, expect, it } from 'vitest';
import type { SyncedTake } from './compareDeck.ts';
import {
  DEFAULT_CONTROLS,
  anySoloed,
  audibleIds,
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

/**
 * The two ways a solo used to apply to nothing.
 *
 * Both showed up as the same thing on screen: a stem's play button that
 * started the whole mix while the mute button beside it worked, so the only
 * way to hear one stem was to mute the others by hand.
 */
describe('a solo that has to reach stems the map has not caught up with', () => {
  it('solos a stem that is not in the map yet', () => {
    const after = soloOnly(new Map(), 'vocals', ['vocals', 'drums']);

    expect(after.get('vocals')?.soloed).toBe(true);
    expect(after.get('drums')?.soloed).toBe(false);
    expect(gainsFor(after).get('drums')).toBe(0);
  });

  it('keeps the settings of stems that are in the map', () => {
    const before = new Map([['drums', controls({ volume: 0.3, muted: true })]]);

    const after = soloOnly(before, 'vocals', ['vocals', 'drums']);

    expect(after.get('drums')?.volume).toBe(0.3);
    expect(after.get('drums')?.muted).toBe(true);
  });

  it('keeps an entry the id list does not mention', () => {
    const before = new Map([['ghost', controls()]]);

    const after = soloOnly(before, 'vocals', ['vocals']);

    expect(after.has('ghost')).toBe(true);
    expect(after.get('ghost')?.soloed).toBe(false);
  });

  it('silences a loaded stem that has no entry in the controls', () => {
    // applyGains used to walk the controls, so a take the map had not reached
    // was never given a volume at all and stayed audible under a solo.
    const vocals = fakeTake();
    const drums = fakeTake();
    const takes = new Map<string, SyncedTake>([
      ['vocals', vocals.take],
      ['drums', drums.take],
    ]);

    applyGains(takes, new Map([['vocals', controls({ soloed: true })]]));

    expect(vocals.calls).toEqual(['setVolume(1)']);
    expect(drums.calls).toEqual(['setVolume(0)']);
  });

  it('gives every loaded stem a volume even with no controls at all', () => {
    const vocals = fakeTake();
    const takes = new Map<string, SyncedTake>([['vocals', vocals.take]]);

    applyGains(takes, new Map());

    expect(vocals.calls).toEqual(['setVolume(1)']);
  });
});

describe('audibleIds', () => {
  const ids = ['vocals', 'converted', 'instrumental'];

  it('counts every stem when nothing is muted or soloed', () => {
    expect(audibleIds(new Map(), ids)).toEqual(ids);
  });

  it('leaves out a muted stem', () => {
    // The swap: original vocal muted, conversion and backing left up.
    const controls = new Map([['vocals', { volume: 1, muted: true, soloed: false }]]);
    expect(audibleIds(controls, ids)).toEqual(['converted', 'instrumental']);
  });

  it('counts only what is soloed while anything is soloed', () => {
    // The state that saved a mix of one vocal and nothing else.
    const controls = new Map([['converted', { volume: 1, muted: false, soloed: true }]]);
    expect(audibleIds(controls, ids)).toEqual(['converted']);
  });

  it('leaves out a stem turned all the way down', () => {
    const controls = new Map([['instrumental', { volume: 0, muted: false, soloed: false }]]);
    expect(audibleIds(controls, ids)).toEqual(['vocals', 'converted']);
  });

  it('can end up with nothing at all', () => {
    const controls = new Map(ids.map((id) => [id, { volume: 1, muted: true, soloed: false }]));
    expect(audibleIds(controls, ids)).toEqual([]);
  });
});
