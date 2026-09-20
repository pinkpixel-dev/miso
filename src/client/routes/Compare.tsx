import { Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Asset, LibraryTake } from '../../shared/types.ts';
import { ComparePane } from '../components/compare/ComparePane.tsx';
import { CompareSwitch } from '../components/player/CompareSwitch.tsx';
import { useCompareDeck } from '../components/player/useCompareDeck.ts';
import { IconButton, Panel } from '../components/ui.tsx';
import { loadLibraryAsset } from '../lib/libraryAsset.ts';
import { taskLabels } from '../lib/librarySearch.ts';
import { useShortcut } from '../lib/shortcuts.ts';
import { useLibrary } from '../lib/useLibrary.ts';
import { usePlayer } from '../lib/usePlayer.ts';

/**
 * Any two takes, heard against each other, at /compare.
 *
 * App level like the library, and for the same reason: the two takes can come
 * from different projects, so the page belongs to neither. This is what the
 * dock's compare cannot do. There, the second take is the one a take was made
 * from, inside the open project, and there is only ever one of it.
 *
 * Both sides are loaded as soon as they are picked. The dock arms its compare
 * because a second stream is a cost nobody asked for when they pressed play.
 * Here, picking the second take is the asking.
 *
 * The page owns both wavesurfer instances through useCompareDeck. It does not
 * borrow the dock's, and it does not touch the dock beyond stopping it on the
 * way in, because three audible takes is nobody's intention.
 */

function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '--:--';
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function CompareRoute() {
  const { takes, tasks, loading, error } = useLibrary();
  const { playing: dockPlaying, toggle: toggleDock } = usePlayer();
  const [params, setParams] = useSearchParams();

  const [chosenA, setChosenA] = useState<LibraryTake | undefined>();
  const [chosenB, setChosenB] = useState<LibraryTake | undefined>();
  const [assetA, setAssetA] = useState<Asset | undefined>();
  const [assetB, setAssetB] = useState<Asset | undefined>();
  const [waveformError, setWaveformError] = useState<string | undefined>();

  const containerA = useRef<HTMLDivElement>(null);
  const containerB = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const deck = useCompareDeck({ a: assetA, b: assetB, containerA, containerB });

  const labels = useMemo(() => taskLabels(tasks), [tasks]);

  // Arriving here follows a link, and a client side route change leaves focus
  // on whatever was clicked.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  /*
    Stop the dock on the way in.

    Two takes here plus whatever the dock was holding is three streams and two
    songs. Pausing is enough to prevent the accident, and it leaves the dock's
    take where it was, so going back to it resumes rather than restarts.

    Only on arrival. Somebody who presses play in the dock while comparing has
    asked for that, and will hear it.
  */
  const dockWasPlaying = useRef(dockPlaying);
  dockWasPlaying.current = dockPlaying;
  const stopDock = useRef(toggleDock);
  stopDock.current = toggleDock;

  useEffect(() => {
    if (dockWasPlaying.current) stopDock.current();
  }, []);

  const choose = useCallback(
    async (side: 'a' | 'b', take: LibraryTake) => {
      if (side === 'a') setChosenA(take);
      else setChosenB(take);

      const loaded = await loadLibraryAsset(take);
      if (side === 'a') setAssetA(loaded.asset);
      else setAssetB(loaded.asset);
      setWaveformError(loaded.error);
    },
    [],
  );

  /*
    Seeded from the address, so a compare can be linked to.

    Asset ids alone, resolved against the library, because a library row already
    carries the project it lives in. An id that matches nothing leaves that side
    empty rather than erroring: the likeliest reason is a take that has since
    been deleted, and an empty picker says that better than a message would.

    Runs once the library has arrived, and only for a side nobody has picked.
  */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || takes.length === 0) return;
    seeded.current = true;

    const wantedA = takes.find((take) => take.assetId === params.get('a'));
    const wantedB = takes.find((take) => take.assetId === params.get('b'));
    if (wantedA) void choose('a', wantedA);
    if (wantedB && wantedB.assetId !== wantedA?.assetId) void choose('b', wantedB);
  }, [takes, params, choose]);

  // The address follows the picks rather than driving them, so a compare you
  // built by clicking is a compare you can send to yourself.
  useEffect(() => {
    if (!seeded.current) return;
    const next = new URLSearchParams();
    if (chosenA) next.set('a', chosenA.assetId);
    if (chosenB) next.set('b', chosenB.assetId);
    setParams(next, { replace: true });
  }, [chosenA, chosenB, setParams]);

  // The key itself, and every rule about when it must not fire, live in the
  // shortcuts table so the help dialog and this page cannot disagree.
  useShortcut('flipCompare', deck.flip, deck.comparable);

  const audibleAsset = deck.audible === 'a' ? assetA : assetB;
  const bothPicked = chosenA !== undefined && chosenB !== undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="min-w-0">
        {/*
          tabIndex -1 so it can be focused on arrival without joining the tab
          order. Programmatic focus raises no focus ring.
        */}
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-display text-lg font-semibold text-ink outline-none"
        >
          Compare
        </h1>
        <p className="mt-0.5 text-sm text-ink-faint">
          Two takes, from any project, at the same point in the song.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink"
        >
          {error}
        </p>
      ) : null}

      {waveformError ? (
        <p
          role="alert"
          className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink"
        >
          A waveform could not be loaded, so that take is drawn from the audio instead.{' '}
          {waveformError}
        </p>
      ) : null}

      {loading && takes.length === 0 ? null : takes.length === 0 ? (
        <Panel title="Nothing to compare yet">
          <p className="text-sm text-ink-muted">
            Comparing needs two takes. They appear here as soon as you have generated or imported
            them.
          </p>
        </Panel>
      ) : (
        <>
          {/*
            Two tracks on a wide window and one on a narrow one. The panes stack
            rather than turning into tabs, because seeing both waveforms at once
            is most of the reason this is a page.
          */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ComparePane
              side="First take"
              label="First take"
              takes={takes}
              labels={labels}
              chosen={chosenA}
              loaded={assetA}
              otherChosenId={chosenB?.assetId}
              onChoose={(take) => void choose('a', take)}
              state={deck.a}
              container={containerA}
              audible={deck.audible === 'a' && bothPicked}
            />
            <ComparePane
              side="Second take"
              label="Second take"
              takes={takes}
              labels={labels}
              chosen={chosenB}
              loaded={assetB}
              otherChosenId={chosenA?.assetId}
              onChoose={(take) => void choose('b', take)}
              state={deck.b}
              container={containerB}
              audible={deck.audible === 'b' && bothPicked}
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 rounded-lg border border-line bg-surface px-4 py-3">
            <IconButton
              label={deck.playing ? 'Pause both takes' : 'Play both takes'}
              icon={deck.playing ? Pause : Play}
              variant="primary"
              size="lg"
              disabled={chosenA === undefined && chosenB === undefined}
              onClick={deck.playPause}
            />

            {bothPicked ? (
              <CompareSwitch
                leftLabel={chosenA?.label ?? 'First take'}
                rightLabel={chosenB?.label ?? 'Second take'}
                live={deck.audible === 'a' ? 'left' : 'right'}
                onFlip={deck.flip}
                disabled={!deck.comparable}
                shortcut="F"
              />
            ) : (
              <p className="text-sm text-ink-muted">
                Pick a take on each side to switch between them.
              </p>
            )}

            <p className="shrink-0 font-mono text-xs text-ink-muted tabular-nums">
              {formatTime(audibleAsset ? deck.elapsed : undefined)} /{' '}
              {formatTime(audibleAsset?.durationSeconds)}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
