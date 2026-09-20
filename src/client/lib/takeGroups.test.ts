import { describe, expect, it } from 'vitest';
import type { Asset, Job, StudioTask } from '../../shared/types.ts';
import { generatedTakes, groupTakes, soundEffectTakes } from './takeGroups.ts';

function asset(id: string, createdAt: string, extra: Partial<Asset> = {}): Asset {
  return {
    id,
    projectId: 'p1',
    kind: 'generated',
    label: id,
    filename: `${id}.wav`,
    format: 'wav',
    bytes: 1000,
    checksum: 'abc',
    createdAt,
    ...extra,
  };
}

function job(id: string, taskId: string, outputAssetIds: string[]): Job {
  return {
    id,
    projectId: 'p1',
    taskId,
    modelId: 'ace_step_turbo_q8_0',
    params: {},
    state: 'complete',
    attempts: 1,
    createdAt: '2026-09-14T00:00:00Z',
    updatedAt: '2026-09-14T00:00:00Z',
    outputAssetIds,
    inputs: [],
  };
}

function task(
  id: string,
  label: string,
  shortLabel: string,
  inputRoles: string[],
  surface?: 'sound',
): StudioTask {
  return {
    guidedPrompt: true,
    id,
    label,
    shortLabel,
    summary: '',
    families: ['ace_step'],
    vocals: 'both',
    packageIds: [],
    inputRoles,
    surface,
    fields: [],
  };
}

const TASKS: StudioTask[] = [
  task('generate.text2music', 'ACE-Step 1.5', 'ACE-Step', []),
  task('generate.stableaudio', 'Stable Audio 3', 'Stable Audio', []),
  task('generate.sfx', 'Make a sound effect', 'Sound effects', [], 'sound'),
  task('remix.repaint', 'Repaint a section', 'Repaints', ['source']),
];

describe('groupTakes', () => {
  it('puts a generated take under the generated heading', () => {
    const takes = [asset('a1', '2026-09-14T10:00:00Z')];
    const jobs = [job('j1', 'generate.text2music', ['a1'])];

    expect(groupTakes(takes, jobs, TASKS)).toEqual([
      { key: 'generated', label: 'Generated songs', takes },
    ]);
  });

  it('gives a derived take its own section, named after the task', () => {
    const generated = asset('a1', '2026-09-14T10:00:00Z');
    const repainted = asset('a2', '2026-09-14T11:00:00Z');
    const jobs = [
      job('j1', 'generate.text2music', ['a1']),
      job('j2', 'remix.repaint', ['a2']),
    ];

    const sections = groupTakes([generated, repainted], jobs, TASKS);

    // The heading names the takes, so it reads as a noun. The task is still
    // offered as "Repaint a section" everywhere it is an action.
    expect(sections.map((section) => section.label)).toEqual([
      'Generated songs',
      'Repaints',
    ]);
    expect(sections[1]?.takes).toEqual([repainted]);
  });

  /** Four generation families are four ways to write a song, not four lists. */
  it('collapses every generating task into one section', () => {
    const jobs = [
      job('j1', 'generate.text2music', ['a1']),
      job('j2', 'generate.stableaudio', ['a2']),
    ];

    const sections = groupTakes(
      [asset('a1', '2026-09-14T10:00:00Z'), asset('a2', '2026-09-14T11:00:00Z')],
      jobs,
      TASKS,
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]?.takes).toHaveLength(2);
  });

  it('treats a take with no producing job as an import', () => {
    const imported = asset('a1', '2026-09-14T10:00:00Z', { kind: 'source' });

    expect(groupTakes([imported], [], TASKS)).toEqual([
      { key: 'imported', label: 'Imported audio', takes: [imported] },
    ]);
  });

  /** A separator's outputs stay together rather than splitting by tool. */
  /**
   * A mix is a whole track, so under the generated heading it would look like
   * something a model wrote. Telling those apart is most of the reason to
   * recombine stems at all.
   */
  it('gives a mix its own section rather than filing it with the generated songs', () => {
    const mix = asset('a1', '2026-09-14T10:00:00Z', { kind: 'mix' });

    expect(groupTakes([mix], [job('j1', 'stems.mix', ['a1'])], TASKS)).toEqual([
      { key: 'mixes', label: 'Mixes', takes: [mix] },
    ]);
  });

  it('groups stems by kind, whatever job produced them', () => {
    const stem = asset('a1', '2026-09-14T10:00:00Z', { kind: 'stem' });
    const jobs = [job('j1', 'remix.repaint', ['a1'])];

    expect(groupTakes([stem], jobs, TASKS)).toEqual([
      { key: 'stems', label: 'Stems', takes: [stem] },
    ]);
  });

  /**
   * The registry is code and a project is data, so a take can outlive the task
   * that made it. It still belongs on the page.
   */
  it('keeps a take whose task this build no longer has', () => {
    const orphan = asset('a1', '2026-09-14T10:00:00Z');
    const jobs = [job('j1', 'remix.retired', ['a1'])];

    expect(groupTakes([orphan], jobs, TASKS)).toEqual([
      { key: 'unknown', label: 'Other takes', takes: [orphan] },
    ]);
  });

  it('orders sections generated, derived, imported, stems, mixes, then unknown', () => {
    const takes = [
      asset('mix', '2026-09-14T10:00:00Z', { kind: 'mix' }),
      asset('stem', '2026-09-14T10:00:00Z', { kind: 'stem' }),
      asset('orphan', '2026-09-14T10:00:00Z'),
      asset('import', '2026-09-14T10:00:00Z', { kind: 'source' }),
      asset('repaint', '2026-09-14T10:00:00Z'),
      asset('effect', '2026-09-14T10:00:00Z'),
      asset('song', '2026-09-14T10:00:00Z'),
    ];
    const jobs = [
      job('j1', 'generate.text2music', ['song']),
      job('j2', 'remix.repaint', ['repaint']),
      job('j3', 'remix.retired', ['orphan']),
      job('j4', 'stems.separate', ['stem']),
      job('j5', 'stems.mix', ['mix']),
      job('j6', 'generate.sfx', ['effect']),
    ];

    expect(groupTakes(takes, jobs, TASKS).map((section) => section.key)).toEqual([
      'generated',
      'sfx',
      'remix.repaint',
      'imported',
      'stems',
      'mixes',
      'unknown',
    ]);
  });

  it('orders takes newest first inside a section', () => {
    const older = asset('a1', '2026-09-14T10:00:00Z');
    const newer = asset('a2', '2026-09-14T12:00:00Z');
    const jobs = [job('j1', 'generate.text2music', ['a1', 'a2'])];

    expect(groupTakes([older, newer], jobs, TASKS)[0]?.takes).toEqual([newer, older]);
  });

  it('returns no sections for a project with nothing in it', () => {
    expect(groupTakes([], [], TASKS)).toEqual([]);
  });

  /** Clearing the queue hides jobs from the queue, it does not delete them. */
  it('still groups a take whose job was cleared from the queue', () => {
    const take = asset('a1', '2026-09-14T10:00:00Z');
    const cleared: Job = { ...job('j1', 'remix.repaint', ['a1']), dismissedAt: '2026-09-14T13:00:00Z' };

    expect(groupTakes([take], [cleared], TASKS)[0]?.key).toBe('remix.repaint');
  });
});

describe('generatedTakes', () => {
  it('keeps generated songs and drops everything else', () => {
    const song = asset('song', '2026-09-14T10:00:00Z');
    const repaint = asset('repaint', '2026-09-14T11:00:00Z');
    const imported = asset('import', '2026-09-14T12:00:00Z', { kind: 'source' });
    const jobs = [
      job('j1', 'generate.text2music', ['song']),
      job('j2', 'remix.repaint', ['repaint']),
    ];

    expect(generatedTakes([song, repaint, imported], jobs, TASKS)).toEqual([song]);
  });

  /**
   * A sound effect is written from nothing, exactly like a song, so the
   * inputRoles rule alone put it in this list and under the Generated songs
   * heading. What tells them apart is the page the task belongs to.
   */
  it('leaves sound effects out, which is what surface is for', () => {
    const song = asset('song', '2026-09-14T10:00:00Z');
    const effect = asset('effect', '2026-09-14T11:00:00Z');
    const jobs = [
      job('j1', 'generate.text2music', ['song']),
      job('j2', 'generate.sfx', ['effect']),
    ];

    expect(generatedTakes([song, effect], jobs, TASKS)).toEqual([song]);
  });

  it('keeps the order it was given, since the caller already sorted', () => {
    const first = asset('a1', '2026-09-14T12:00:00Z');
    const second = asset('a2', '2026-09-14T10:00:00Z');
    const jobs = [job('j1', 'generate.text2music', ['a1', 'a2'])];

    expect(generatedTakes([first, second], jobs, TASKS)).toEqual([first, second]);
  });

  it('is empty for a project of nothing but imports', () => {
    const imported = asset('a1', '2026-09-14T10:00:00Z', { kind: 'source' });
    expect(generatedTakes([imported], [], TASKS)).toEqual([]);
  });
});

describe('soundEffectTakes', () => {
  it('keeps what the sound page wrote and nothing else', () => {
    const effect = asset('effect', '2026-09-14T11:00:00Z');
    const song = asset('song', '2026-09-14T10:00:00Z');
    const imported = asset('import', '2026-09-14T12:00:00Z', { kind: 'source' });
    const jobs = [
      job('j1', 'generate.sfx', ['effect']),
      job('j2', 'generate.text2music', ['song']),
    ];

    expect(soundEffectTakes([effect, song, imported], jobs, TASKS)).toEqual([effect]);
  });

  it('holds its own section on the project page too', () => {
    const effect = asset('effect', '2026-09-14T11:00:00Z');
    const jobs = [job('j1', 'generate.sfx', ['effect'])];

    expect(groupTakes([effect], jobs, TASKS)).toEqual([
      { key: 'sfx', label: 'Sound effects', takes: [effect] },
    ]);
  });

  it('is empty for a project that has never made one', () => {
    const song = asset('song', '2026-09-14T10:00:00Z');
    expect(soundEffectTakes([song], [job('j1', 'generate.text2music', ['song'])], TASKS)).toEqual([]);
  });
});
