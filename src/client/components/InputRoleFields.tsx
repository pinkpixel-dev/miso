import type { Asset, StudioTask } from '../../shared/types.ts';
import { extraInputRoles } from '../lib/remixTasks.ts';

/**
 * A picker for every track a task reads beyond the one the page is already on.
 *
 * Shared by the remix page and the create column, because both pages now drive
 * tasks that read a second track and neither of them should know what
 * "voiceRef" means. The task says what to call each role and whether it can be
 * left out, and this draws whatever it said.
 *
 * The tracks offered are the project's own. A voice reference is audio, the
 * library already holds audio, and the import route already accepts wav, flac,
 * mp3 and m4a, so a second upload path would only have produced files the
 * library could not see afterwards. See DOCS/MEMORY.md.
 */
export function InputRoleFields({
  task,
  assets,
  exclude,
  values,
  onChange,
}: {
  task: StudioTask;
  assets: Asset[];
  /**
   * A track to keep off the lists, which on the remix page is the take being
   * worked on. Converting a vocal into its own voice is a long way to
   * round-trip a file.
   */
  exclude?: string;
  /** The chosen track per role, by role name. */
  values: Record<string, string>;
  onChange: (role: string, assetId: string) => void;
}) {
  const roles = extraInputRoles(task);
  if (roles.length === 0) return null;

  const candidates = assets.filter((entry) => entry.id !== exclude);
  const optional = new Set(task.optionalInputRoles ?? []);

  return (
    <>
      {roles.map((role) => {
        const copy = task.inputRoleLabels?.[role];
        const helpId = `role-${task.id}-${role}-help`;
        const isOptional = optional.has(role);

        return (
          <div key={role} className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">{copy?.label ?? role}</span>
              <select
                value={values[role] ?? ''}
                disabled={candidates.length === 0}
                aria-describedby={copy?.help ? helpId : undefined}
                onChange={(event) => onChange(role, event.target.value)}
                className="min-h-9 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink transition-colors duration-150 hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-45"
              >
                {/*
                  An optional role says so in the empty entry rather than only in
                  the help text underneath, because the empty entry is what is on
                  screen when the decision is being made.
                */}
                <option value="">
                  {candidates.length === 0
                    ? 'No other track in this project'
                    : isOptional
                      ? 'None'
                      : 'Choose a track'}
                </option>
                {candidates.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            {copy?.help ? (
              <p id={helpId} className="text-xs text-ink-faint">
                {copy.help}
              </p>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/**
 * Whether a required track is still unchosen, which is what holds the button.
 *
 * An optional role left empty is an answer rather than a gap: sing without a
 * melody writes its own. Kept beside the picker so the rule that draws the
 * control and the rule that blocks on it cannot drift apart.
 */
export function missingRequiredRole(task: StudioTask, values: Record<string, string>): boolean {
  const optional = new Set(task.optionalInputRoles ?? []);
  return extraInputRoles(task).some(
    (role) => !optional.has(role) && (values[role] ?? '') === '',
  );
}

/**
 * The chosen tracks as the job route wants them, with the empty ones dropped.
 *
 * `source` is added by the caller when there is one, because only the page
 * knows which take it opened on.
 */
export function roleInputs(
  task: StudioTask,
  values: Record<string, string>,
): { assetId: string; role: string }[] {
  return extraInputRoles(task)
    .filter((role) => (values[role] ?? '') !== '')
    .map((role) => ({ assetId: values[role] as string, role }));
}
