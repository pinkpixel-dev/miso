import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { migrate } from '../migrate.ts';

const migrationsDir = dirname(fileURLToPath(import.meta.url));

function fresh(): Database.Database {
  const handle = new Database(':memory:');
  handle.pragma('foreign_keys = ON');
  migrate(handle);
  return handle;
}

function tableNames(handle: Database.Database): string[] {
  return handle
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);
}

describe('003_library.sql', () => {
  it('creates all five library tables', () => {
    const names = tableNames(fresh());
    for (const table of ['projects', 'assets', 'jobs', 'asset_lineage', 'staged_uploads']) {
      expect(names).toContain(table);
    }
  });

  it('deletes a project\'s assets with the project', () => {
    const handle = fresh();
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();
    handle
      .prepare(
        `INSERT INTO assets (id, project_id, kind, label, filename, format, bytes, checksum)
         VALUES ('a1', 'p1', 'source', 'Take 1', 'take1.wav', 'wav', 100, 'abc')`,
      )
      .run();

    handle.prepare("DELETE FROM projects WHERE id = 'p1'").run();

    const left = handle.prepare('SELECT COUNT(*) AS n FROM assets').get() as { n: number };
    expect(left.n).toBe(0);
  });

  it('refuses an asset format outside the accepted four', () => {
    const handle = fresh();
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();

    expect(() =>
      handle
        .prepare(
          `INSERT INTO assets (id, project_id, kind, label, filename, format, bytes, checksum)
           VALUES ('a1', 'p1', 'source', 'Take 1', 'take1.ogg', 'ogg', 100, 'abc')`,
        )
        .run(),
    ).toThrow();
  });
});

describe('004_jobs.sql', () => {
  it('adds staging to the states a job can be in', () => {
    const handle = fresh();
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();

    const insert = (state: string) =>
      handle
        .prepare(
          `INSERT INTO jobs (id, project_id, task_id, model_id, params, state)
           VALUES (?, 'p1', 'generate.text2music', 'ace_step_turbo_q8_0', '{}', ?)`,
        )
        .run(`job-${state}`, state);

    for (const state of ['queued', 'staging', 'running', 'complete', 'failed', 'cancelled']) {
      expect(() => insert(state)).not.toThrow();
    }
    expect(() => insert('halfway')).toThrow();
  });

  /**
   * The migration drops and recreates jobs, and both assets and asset_lineage
   * reference it. This is the case that would break a real library rather than
   * an empty one.
   */
  it('leaves an existing library intact', () => {
    const handle = new Database(':memory:');
    handle.pragma('foreign_keys = ON');

    // Everything up to the point where 004 has not been applied yet.
    const upTo003 = readdirSync(join(migrationsDir))
      .filter((name) => name.endsWith('.sql') && name < '004')
      .sort();
    for (const name of upTo003) handle.exec(readFileSync(join(migrationsDir, name), 'utf8'));

    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();
    handle
      .prepare(
        `INSERT INTO assets (id, project_id, kind, label, filename, format, bytes, checksum)
         VALUES ('a1', 'p1', 'source', 'Take 1', 'take1.wav', 'wav', 100, 'abc')`,
      )
      .run();

    handle.exec(readFileSync(join(migrationsDir, '004_jobs.sql'), 'utf8'));

    expect(handle.prepare('SELECT COUNT(*) AS n FROM assets').get()).toEqual({ n: 1 });
    expect(handle.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

    // And the recreated table still accepts a job the asset can point at.
    handle
      .prepare(
        `INSERT INTO jobs (id, project_id, task_id, model_id, params, state)
         VALUES ('j1', 'p1', 'generate.text2music', 'ace_step_turbo_q8_0', '{}', 'queued')`,
      )
      .run();
    handle.prepare("UPDATE assets SET job_id = 'j1' WHERE id = 'a1'").run();
    expect(handle.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

/**
 * The assets table is rebuilt here, which is the riskiest shape a migration
 * takes in this project. What these check is that the rebuild kept everything:
 * the rows, the cascade, the index, and the other tables still pointing at it.
 */
describe('008_mix.sql', () => {
  function withAsset(handle: Database.Database, kind: string, id = 'a1'): void {
    handle
      .prepare(
        `INSERT INTO assets (id, project_id, kind, label, filename, format, bytes, checksum)
         VALUES (?, 'p1', ?, 'Take 1', 'take1.wav', 'wav', 100, 'abc')`,
      )
      .run(id, kind);
  }

  it('accepts a mix', () => {
    const handle = fresh();
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();

    expect(() => withAsset(handle, 'mix')).not.toThrow();
  });

  it('still accepts the three kinds that came before', () => {
    const handle = fresh();
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();

    expect(() => withAsset(handle, 'source', 'a1')).not.toThrow();
    expect(() => withAsset(handle, 'generated', 'a2')).not.toThrow();
    expect(() => withAsset(handle, 'stem', 'a3')).not.toThrow();
  });

  it('still refuses a kind that is not one of the four', () => {
    const handle = fresh();
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();

    expect(() => withAsset(handle, 'remix')).toThrow();
  });

  it('keeps rows that were there before the rebuild', () => {
    // Run the earlier migrations, put a row in, then let 008 rebuild under it.
    const handle = new Database(':memory:');
    handle.pragma('foreign_keys = ON');

    const before = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f < '008')
      .sort();
    for (const name of before) handle.exec(readFileSync(join(migrationsDir, name), 'utf8'));

    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();
    withAsset(handle, 'generated', 'kept');

    handle.exec(readFileSync(join(migrationsDir, '008_mix.sql'), 'utf8'));

    const row = handle.prepare("SELECT label, kind FROM assets WHERE id = 'kept'").get() as
      | { label: string; kind: string }
      | undefined;
    expect(row).toEqual({ label: 'Take 1', kind: 'generated' });
  });

  /**
   * The trap this migration was written around, and the reason it copies the
   * children out and back.
   *
   * With foreign keys enforced, DROP TABLE runs an implicit DELETE of every
   * row first, and both asset_lineage and staged_uploads cascade from assets.
   * A rebuild that ignores this drops every record of what was made from what,
   * silently, on a database that has history in it.
   */
  it('carries lineage and staged uploads across the rebuild', () => {
    const handle = new Database(':memory:');
    handle.pragma('foreign_keys = ON');

    const before = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f < '008')
      .sort();
    for (const name of before) handle.exec(readFileSync(join(migrationsDir, name), 'utf8'));

    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();
    handle
      .prepare(
        `INSERT INTO jobs (id, project_id, task_id, model_id, params, state)
         VALUES ('j1', 'p1', 'stems.separate', 'htdemucs_q8_0', '{}', 'complete')`,
      )
      .run();
    withAsset(handle, 'generated', 'a1');
    handle
      .prepare("INSERT INTO asset_lineage (job_id, asset_id, role) VALUES ('j1', 'a1', 'source')")
      .run();
    handle
      .prepare(
        `INSERT INTO staged_uploads (asset_id, server_identity, remote_path)
         VALUES ('a1', 'http://backend', '/tmp/audiocpp-ui-1/1-a.wav')`,
      )
      .run();

    handle.exec(readFileSync(join(migrationsDir, '008_mix.sql'), 'utf8'));

    const lineage = handle.prepare('SELECT COUNT(*) AS n FROM asset_lineage').get() as { n: number };
    const staged = handle.prepare('SELECT COUNT(*) AS n FROM staged_uploads').get() as { n: number };
    expect(lineage.n).toBe(1);
    expect(staged.n).toBe(1);

    const violations = handle.prepare('PRAGMA foreign_key_check').all();
    expect(violations).toEqual([]);
  });

  it('keeps the project cascade through the rebuild', () => {
    const handle = fresh();
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();
    withAsset(handle, 'mix');

    handle.prepare("DELETE FROM projects WHERE id = 'p1'").run();

    const left = handle.prepare('SELECT COUNT(*) AS n FROM assets').get() as { n: number };
    expect(left.n).toBe(0);
  });

  it('keeps the lineage cascade pointing at the rebuilt table', () => {
    const handle = fresh();
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();
    handle
      .prepare(
        `INSERT INTO jobs (id, project_id, task_id, model_id, params, state)
         VALUES ('j1', 'p1', 'stems.separate', 'htdemucs_q8_0', '{}', 'complete')`,
      )
      .run();
    withAsset(handle, 'stem');
    handle
      .prepare("INSERT INTO asset_lineage (job_id, asset_id, role) VALUES ('j1', 'a1', 'source')")
      .run();

    handle.prepare("DELETE FROM assets WHERE id = 'a1'").run();

    const left = handle.prepare('SELECT COUNT(*) AS n FROM asset_lineage').get() as { n: number };
    expect(left.n).toBe(0);
  });

  it('keeps the index the project list reads', () => {
    const handle = fresh();
    const names = handle
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'assets'")
      .all()
      .map((r) => (r as { name: string }).name);

    expect(names).toContain('assets_by_project');
  });
});

describe('010_scores.sql', () => {
  function withTake(handle: Database.Database) {
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();
    handle
      .prepare(
        `INSERT INTO assets (id, project_id, kind, label, filename, format, bytes, checksum)
         VALUES ('a1', 'p1', 'generated', 'Night Drive', 'night.wav', 'wav', 100, 'abc')`,
      )
      .run();
    handle
      .prepare(
        `INSERT INTO score_artifacts (id, project_id, asset_id, label, filename, bytes, checksum, abc)
         VALUES ('s1', 'p1', 'a1', 'Night Drive', 'Night Drive.abc', 12, 'def', 'X:1')`,
      )
      .run();
  }

  it('creates the table', () => {
    expect(tableNames(fresh())).toContain('score_artifacts');
  });

  it('deletes a score with the take it was planned for', () => {
    // A plan for a song that no longer exists means nothing.
    const handle = fresh();
    withTake(handle);

    handle.prepare("DELETE FROM assets WHERE id = 'a1'").run();

    const left = handle.prepare('SELECT COUNT(*) AS n FROM score_artifacts').get() as { n: number };
    expect(left.n).toBe(0);
  });

  it('deletes a score with its project', () => {
    const handle = fresh();
    withTake(handle);

    handle.prepare("DELETE FROM projects WHERE id = 'p1'").run();

    const left = handle.prepare('SELECT COUNT(*) AS n FROM score_artifacts').get() as { n: number };
    expect(left.n).toBe(0);
  });

  it('refuses a score for a take that does not exist', () => {
    const handle = fresh();
    handle.prepare("INSERT INTO projects (id, name) VALUES ('p1', 'Demo')").run();

    expect(() =>
      handle
        .prepare(
          `INSERT INTO score_artifacts (id, project_id, asset_id, label, filename, bytes, checksum, abc)
           VALUES ('s1', 'p1', 'nope', 'x', 'x.abc', 1, 'd', 'X:1')`,
        )
        .run(),
    ).toThrow();
  });
});

