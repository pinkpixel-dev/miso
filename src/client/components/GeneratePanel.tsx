import { Plus, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  Catalog,
  CatalogPackage,
  Job,
  PromptSuggestion,
  StudioState,
  StudioTask,
} from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { buildLabel, installedPackages } from '../lib/models.ts';
import { EMPTY_STUDIO, compile, supportsGuided, wantsLyrics } from '../lib/studio.ts';
import { estimateSeconds } from '../lib/useJobs.ts';
import { BuilderCard } from './BuilderCard.tsx';
import { ConfirmDialog } from './Dialog.tsx';
import { PromptBuilder } from './PromptBuilder.tsx';
import { PromptSuggestionDialog } from './PromptSuggestionDialog.tsx';
import { SavedPrompts } from './SavedPrompts.tsx';
import { PlainField } from './TaskFields.tsx';
import { Button, IconButton, Panel, SegmentedControl } from './ui.tsx';

/**
 * The create column.
 *
 * There are two ways in and they write the same job. Guided mode collects boxes
 * and a toggle and compiles them into the prompt. Custom mode is the fields the
 * task declares, rendered as they come, for when the prompt is already in
 * somebody's head.
 *
 * The fields themselves still come from what the service says the task takes,
 * in both modes. That is the point of the task registry: a new task arrives as
 * data and gets a working form without a new screen. What guided mode adds on
 * top is the compiler, which knows one family so far.
 *
 * The layout is a column of cards with one primary action pinned to the bottom.
 * Everything that is not a box lives in a card header, so the form reads as
 * things to fill in rather than a run of buttons to press.
 */

type Values = Record<string, string>;
type Mode = 'guided' | 'custom';

const MODES: { value: Mode; label: string }[] = [
  { value: 'guided', label: 'Guided' },
  { value: 'custom', label: 'Custom' },
];

/**
 * Fields guided mode draws itself, so the plain renderer must not draw them again.
 *
 * `tags` is here because the builder compiles it for HeartMuLa out of the same
 * words the other families put in the prompt. Custom mode still asks for it,
 * which is where the box comes back.
 */
const BUILT_BY_GUIDED = new Set(['prompt', 'lyrics', 'bpm', 'keyscale', 'tags']);

function initialValues(task: StudioTask): Values {
  const values: Values = {};
  for (const field of task.fields) {
    values[field.name] = field.default === undefined ? '' : String(field.default);
  }
  return values;
}

/** One installed model the studio can generate with, and the task that runs it. */
interface ModelChoice {
  task: StudioTask;
  pkg: CatalogPackage;
}

/**
 * Every installed model this build can generate with, in family order.
 *
 * One list, rather than a family control and a build control beside it. What
 * you download is a model you can run, and its name already says which family
 * it belongs to, so asking for the family first put the same question on screen
 * twice.
 *
 * A task is only offered the packages it declares. Stable Audio ships SFX
 * packages beside its music ones, and those belong to a task this form does not
 * run, so they are left out here and the service would refuse them anyway.
 */
function modelChoices(catalog: Catalog | undefined, tasks: StudioTask[]): ModelChoice[] {
  const choices: ModelChoice[] = [];

  for (const task of tasks) {
    for (const pkg of installedPackages(catalog, task)) choices.push({ task, pkg });
  }

  return choices;
}

function describeEstimate(seconds: number | undefined): string {
  if (seconds === undefined) return 'The first run also loads the model, so it takes longer.';
  if (seconds < 90) return `Past runs took about ${seconds} seconds.`;
  return `Past runs took about ${Math.round(seconds / 60)} minutes.`;
}

export function GeneratePanel({
  tasks,
  jobs,
  catalog,
  catalogLoading,
  onSubmit,
}: {
  tasks: StudioTask[];
  jobs: Job[];
  catalog: Catalog | undefined;
  catalogLoading: boolean;
  onSubmit: (body: {
    taskId: string;
    modelId: string;
    params: Record<string, string | number>;
    title?: string;
    studio?: StudioState;
    originalPrompt?: string;
  }) => Promise<boolean>;
}) {
  const [modelId, setModelId] = useState<string | undefined>();
  const [values, setValues] = useState<Values>({});
  const [title, setTitle] = useState('');
  const [builder, setBuilder] = useState<StudioState>(EMPTY_STUDIO);
  const [mode, setMode] = useState<Mode>('guided');
  const [submitting, setSubmitting] = useState(false);
  const [confirmingNew, setConfirmingNew] = useState(false);

  // An accepted expansion replaces the prompt that is sent and keeps the one it
  // came from, which is what the job records as the original. `origin` is what
  // it was made from rather than what that compiled to, which is what lets it
  // survive a model switch.
  const [enhanced, setEnhanced] = useState<
    { origin: string; original: string; text: string } | undefined
  >();
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<PromptSuggestion | undefined>();
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestError, setSuggestError] = useState<string | undefined>();

  // Only the tasks that write a track from nothing. A remix route runs on the
  // same families and draws its fields the same way, so without this filter
  // every one of them turns up in the model list as though it were another
  // model to generate with. The remix tools have their own page.
  const generators = useMemo(() => tasks.filter((task) => task.inputRoles.length === 0), [tasks]);
  const choices = useMemo(() => modelChoices(catalog, generators), [catalog, generators]);

  // The chosen model decides the task, rather than the task deciding which
  // models are on offer. With nothing installed the form falls back to the
  // first task, so it still has fields to draw and somewhere to put the message
  // saying to go and install something.
  const chosen = choices.find((entry) => entry.pkg.id === modelId) ?? choices[0];
  const task = chosen?.task ?? generators[0];
  const chosenModel = chosen?.pkg.id;
  const fieldValues = Object.keys(values).length > 0 || !task ? values : initialValues(task);

  if (!task) {
    return (
      <Panel title="Generate">
        <p className="text-sm text-ink-muted">Loading what this build can do.</p>
      </Panel>
    );
  }

  // A family with no compilation rules has no guided mode to offer, so the
  // switch disappears rather than sitting there doing nothing.
  const guidedAvailable = supportsGuided(task.family);
  const guided = guidedAvailable && mode === 'guided';

  const setValue = (name: string, value: string) => setValues({ ...fieldValues, [name]: value });

  // Compiled once per render. The prompt is shown in full before anything is
  // queued, and the params are whatever else this family asks the builder to
  // write, which today is HeartMuLa's tags and nothing else.
  const compiled = guided ? compile(builder, task.family, task.vocals) : undefined;
  const written = compiled ? compiled.prompt : (fieldValues.prompt ?? '').trim();

  // What the expansion was made from, which is not the same as what it compiled
  // to. Every family writes the compiled prompt differently, so anchoring
  // staleness to that text threw a perfectly good expansion away on a model
  // switch and charged another call to the provider for it. Anchored to the
  // builder instead, an expansion lasts until the words behind it change.
  const enhanceOrigin = guided
    ? JSON.stringify([builder.style, builder.mood, builder.vocalMode, builder.vocalStyle])
    : written;

  // An expansion stops applying the moment the form it was made from changes,
  // because a prompt written for a different style is not an expansion of this
  // one any more.
  const stale = enhanced !== undefined && enhanced.origin !== enhanceOrigin;
  const prompt = enhanced !== undefined && !stale ? enhanced.text : written;
  const instrumental = guided && !wantsLyrics(builder, task.vocals);

  // The dialog opens on an answer, not on the request, so nobody is shown two
  // empty boxes while a provider thinks about it. A failure before it opens has
  // nowhere to go but the form itself.
  const askForPrompt = async () => {
    setSuggestBusy(true);
    setSuggestError(undefined);
    try {
      setSuggestion(
        await api.enhancePrompt({ prompt: written, studio: guided ? builder : undefined }),
      );
      setSuggesting(true);
    } catch (cause) {
      setSuggestError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSuggestBusy(false);
    }
  };

  const plainFields = task.fields.filter(
    (field) => !field.advanced && !(guided && BUILT_BY_GUIDED.has(field.name)),
  );
  const advancedFields = task.fields.filter((field) => field.advanced);

  const missing = task.fields.some((field) => {
    if (!field.required) return false;
    if (guided && field.name === 'prompt') return prompt === '';
    // A required field the builder writes is satisfied by what it wrote, not by
    // a box that guided mode never put on screen.
    const built = compiled?.params[field.name];
    if (built !== undefined) return built === '';
    return (fieldValues[field.name] ?? '').trim() === '';
  });

  // Whether starting again would lose anything. Boxes are compared against the
  // task's own defaults rather than against empty, because a length that still
  // reads 180 is not something anybody typed.
  const defaults = initialValues(task);
  const dirty =
    title.trim() !== '' ||
    enhanced !== undefined ||
    builder.style.trim() !== '' ||
    builder.mood.trim() !== '' ||
    builder.vocalStyle.trim() !== '' ||
    builder.vocalMode !== EMPTY_STUDIO.vocalMode ||
    (Object.keys(values).length > 0 &&
      task.fields.some((field) => (values[field.name] ?? '') !== (defaults[field.name] ?? '')));

  // Everything describing the song goes, and the model stays. Clearing values
  // back to an empty object is what restores the task's declared defaults,
  // because fieldValues falls back to them while nothing has been typed.
  const reset = () => {
    setValues({});
    setTitle('');
    setBuilder(EMPTY_STUDIO);
    setMode('guided');
    setEnhanced(undefined);
    setSuggestion(undefined);
    setSuggestError(undefined);
    setSuggesting(false);
    setConfirmingNew(false);
  };

  const submit = async () => {
    if (!chosenModel) return;
    setSubmitting(true);

    const params: Record<string, string | number> = {};
    for (const field of task.fields) {
      // The compiled prompt is the prompt in guided mode, and the lyrics box
      // is off while the vocals are instrumental, so what is in it is kept for
      // later rather than sent now.
      if (guided && field.name === 'prompt') {
        if (prompt !== '') params.prompt = prompt;
        continue;
      }
      if (instrumental && field.kind === 'lyrics') continue;

      // Fields the builder writes for this family. The box is not on screen in
      // guided mode, so the value comes from the compiler rather than from
      // whatever custom mode was last left holding.
      const built = compiled?.params[field.name];
      if (built !== undefined) {
        if (built !== '') params[field.name] = built;
        continue;
      }

      const raw = (fieldValues[field.name] ?? '').trim();
      if (raw === '') continue;
      params[field.name] = field.kind === 'number' ? Number(raw) : raw;
    }

    const ok = await onSubmit({
      taskId: task.id,
      modelId: chosenModel,
      params,
      title: title.trim() === '' ? undefined : title.trim(),
      studio: guided ? builder : undefined,
      // The prompt as it was written before the assistant expanded it, which
      // the expansion carries with it rather than being recompiled from the
      // family that happens to be selected now.
      originalPrompt: enhanced !== undefined && !stale ? enhanced.original : undefined,
    });
    setSubmitting(false);

    // The form stays on a success, because the next thing people do is change
    // one word and run it again. Only the queue tells them it worked.
    if (ok) return;
  };

  return (
    <div className="flex flex-col gap-4">
      {/*
        The head of the column is a toolbar, not the first row of the form. The
        mode switch and the model are choices about the whole job, so they sit
        above the cards at a size that does not compete with them.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex shrink-0 items-center gap-2">
          {guidedAvailable ? (
            <SegmentedControl
              label="Prompt"
              labelHidden
              size="sm"
              name="prompt-mode"
              options={MODES}
              value={mode}
              onChange={(next) => {
                // Custom mode opens on whatever guided mode had built, so the
                // switch is a handover rather than a blank page. What is already
                // in the box wins, because that was typed.
                if (next === 'custom' && (fieldValues.prompt ?? '').trim() === '' && prompt !== '') {
                  setValues({ ...fieldValues, prompt });
                }
                setMode(next);
              }}
            />
          ) : null}

          {/*
            Clearing the form used to mean reloading the page. The model is
            left alone on purpose: it is a machine setting rather than part of
            the song, and re-picking it for every track would be a worse
            annoyance than the one this fixes.
          */}
          <Button
            variant="ghost"
            className="min-h-9 px-2.5 py-1.5 text-xs"
            onClick={() => (dirty ? setConfirmingNew(true) : reset())}
          >
            <Plus aria-hidden="true" className="h-4 w-4 shrink-0" />
            New song
          </Button>
        </div>

        {/*
          One list of what is downloaded. Picking a model picks its family too,
          because a package belongs to exactly one, which is why there is no
          separate family control beside this. The headings name the model and
          the options under them name the build, so neither repeats the other.
        */}
        <label className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="shrink-0 text-xs font-medium text-ink-faint">Model</span>
          <select
            value={chosenModel ?? ''}
            disabled={choices.length === 0}
            onChange={(event) => {
              const next = choices.find((entry) => entry.pkg.id === event.target.value);
              setModelId(event.target.value);
              // A different family draws different fields, so what was typed
              // into the last one is let go rather than carried into a form it
              // does not belong to. Moving between builds of one model keeps it.
              if (next && next.task.id !== task.id) {
                // The prompt is kept, and everything else is let go. It is the
                // one field every generation task has, and the one that may
                // have cost a call to the provider, so carrying it across is
                // worth more than the tidiness of a blank form. The expansion
                // made from it survives with it.
                const carried = (fieldValues.prompt ?? '').trim();
                setValues(carried === '' ? {} : { prompt: fieldValues.prompt ?? '' });
              }
            }}
            className="min-h-9 min-w-0 max-w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink transition-colors duration-150 hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-45"
          >
            {choices.length === 0 ? (
              <option value="">No model installed</option>
            ) : (
              generators.map((entry) => {
                const group = choices.filter((choice) => choice.task.id === entry.id);
                if (group.length === 0) return null;

                return (
                  <optgroup key={entry.id} label={entry.label}>
                    {group.map(({ pkg }) => (
                      <option key={pkg.id} value={pkg.id}>
                        {buildLabel(pkg, entry.label)}
                        {pkg.recommended ? ' (recommended)' : ''}
                      </option>
                    ))}
                  </optgroup>
                );
              })
            )}
          </select>
        </label>
      </div>

      <p className="-mt-2 text-xs text-ink-faint">
        {describeEstimate(chosenModel ? estimateSeconds(jobs, task.id, chosenModel) : undefined)}
      </p>

      {/*
        The title is the name of the thing being made, so it reads as one:
        larger type, no label above it, at the top of the column. The label is
        still there for a screen reader, and the hint still says what it is for.
      */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="song-title" className="sr-only">
          Song title
        </label>
        <input
          id="song-title"
          value={title}
          placeholder="Song title"
          aria-describedby="song-title-hint"
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 font-display text-base text-ink transition-colors duration-150 placeholder:text-ink-faint hover:border-line-strong"
        />
        <p id="song-title-hint" className="text-sm text-ink-faint">
          What the take is called in your library. Not sent to the model.
        </p>
      </div>

      {guided ? (
        <PromptBuilder
          task={task}
          builder={builder}
          onBuilder={setBuilder}
          values={fieldValues}
          onValue={setValue}
          onTitle={(next) => {
            if (title.trim() === '') setTitle(next);
          }}
          onEnhance={() => void askForPrompt()}
          enhanceBusy={suggestBusy}
          canEnhance={written !== ''}
        />
      ) : null}

      {plainFields.length > 0 ? (
        <BuilderCard
          id={guided ? 'other' : 'prompt'}
          title={guided ? 'Other options' : 'Prompt'}
          actions={
            guided ? undefined : (
              <IconButton
                label={suggestBusy ? 'Asking for a richer prompt' : 'Make the prompt richer'}
                icon={Sparkles}
                variant="primary"
                disabled={written === '' || suggestBusy}
                onClick={() => void askForPrompt()}
              />
            )
          }
        >
          <div className="flex flex-col gap-5">
            {plainFields.map((field) => (
              <PlainField
                key={field.name}
                field={field}
                value={fieldValues[field.name] ?? ''}
                onChange={(value) => setValue(field.name, value)}
              />
            ))}
          </div>
        </BuilderCard>
      ) : null}

      {enhanced !== undefined && !stale ? (
        <div className="flex flex-col gap-2 rounded-md border border-accent/40 bg-accent/5 px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink">
              This is the prompt that will be sent
            </span>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => setEnhanced(undefined)}
            >
              Use mine instead
            </Button>
          </div>
          <p className="font-mono text-xs leading-relaxed text-ink-muted">{enhanced.text}</p>
          <p className="text-sm text-ink-faint">
            Your own prompt is kept with the take, so you can see the idea as well as the expansion.
          </p>
        </div>
      ) : null}

      {suggestError !== undefined && !suggesting ? (
        <p
          role="alert"
          className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-ink"
        >
          {suggestError}
        </p>
      ) : null}

      <SavedPrompts
        kind="prompt"
        body={prompt}
        onLoad={(body) => {
          // A saved prompt is a finished sentence, and guided mode would
          // compile straight over it, so loading one moves to custom mode
          // where it is the prompt.
          setEnhanced(undefined);
          setValues({ ...fieldValues, prompt: body });
          setMode('custom');
        }}
      />

      <PromptSuggestionDialog
        open={suggesting}
        suggestion={suggestion}
        busy={suggestBusy}
        error={suggesting ? suggestError : undefined}
        onRetry={() => void askForPrompt()}
        onAccept={(next) => setEnhanced({ origin: enhanceOrigin, original: written, text: next })}
        onClose={() => {
          setSuggesting(false);
          setSuggestion(undefined);
          setSuggestError(undefined);
        }}
      />

      {/*
        Asked rather than done, because lyrics are typed by hand and a prompt
        may have cost a call to a provider. An empty form clears without this,
        since a confirmation over nothing is just another click.
      */}
      <ConfirmDialog
        open={confirmingNew}
        title="Start a new song?"
        body="The title, prompt, lyrics and builder settings on this form are cleared. Takes you have already generated are not touched."
        confirmLabel="Clear the form"
        onConfirm={reset}
        onCancel={() => setConfirmingNew(false)}
      />

      {advancedFields.length > 0 ? (
        <BuilderCard
          id="advanced"
          title={`Advanced options (${advancedFields.length})`}
          defaultOpen={false}
        >
          <div className="flex flex-col gap-5">
            <p className="text-sm text-ink-faint">
              Left alone these use the model's own defaults. A seed is worth setting when a take
              came out right and you want it again.
            </p>
            {advancedFields.map((field) => (
              <PlainField
                key={field.name}
                field={field}
                value={fieldValues[field.name] ?? ''}
                onChange={(value) => setValue(field.name, value)}
              />
            ))}
          </div>
        </BuilderCard>
      ) : null}

      {choices.length === 0 && !catalogLoading ? (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
          No generation model is installed.{' '}
          <Link to="/models" className="text-accent underline underline-offset-4 hover:no-underline">
            Install one on the Models screen
          </Link>
          .
        </p>
      ) : null}

      {/*
        Pinned so it does not scroll away. The create column is long now that
        the cards are stacked, and the one thing you always want to reach is the
        one thing that was always at the bottom.
      */}
      <div className="sticky bottom-0 z-10 -mx-5 mt-2 border-t border-line bg-canvas px-5 pb-4 pt-3">
        <Button
          variant="primary"
          onClick={() => void submit()}
          busy={submitting}
          disabled={missing || !chosenModel}
          className="min-h-11 w-full"
        >
          {submitting ? 'Queueing' : 'Generate'}
        </Button>
      </div>
    </div>
  );
}
