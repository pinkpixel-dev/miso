import { Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  Catalog,
  CatalogPackage,
  Job,
  PromptSuggestion,
  StudioState,
  StudioTask,
  TaskField,
} from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { EMPTY_STUDIO, compilePrompt, supportsGuided, wantsLyrics } from '../lib/studio.ts';
import { estimateSeconds } from '../lib/useJobs.ts';
import { BuilderCard } from './BuilderCard.tsx';
import { LyricsEditor } from './LyricsEditor.tsx';
import { PromptBuilder } from './PromptBuilder.tsx';
import { PromptSuggestionDialog } from './PromptSuggestionDialog.tsx';
import { SavedPrompts } from './SavedPrompts.tsx';
import { Button, Field, IconButton, Panel, SegmentedControl, TextArea } from './ui.tsx';

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

/** Fields guided mode draws itself, so the plain renderer must not draw them again. */
const BUILT_BY_GUIDED = new Set(['prompt', 'lyrics', 'bpm', 'keyscale']);

function initialValues(task: StudioTask): Values {
  const values: Values = {};
  for (const field of task.fields) {
    values[field.name] = field.default === undefined ? '' : String(field.default);
  }
  return values;
}

/** Installed packages of this task's family, recommended first. */
function packagesFor(catalog: Catalog | undefined, task: StudioTask): CatalogPackage[] {
  const family = catalog?.families.find((entry) => entry.family === task.family);
  if (!family) return [];
  return [...family.packages].sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

function describeEstimate(seconds: number | undefined): string {
  if (seconds === undefined) return 'The first run also loads the model, so it takes longer.';
  if (seconds < 90) return `Past runs took about ${seconds} seconds.`;
  return `Past runs took about ${Math.round(seconds / 60)} minutes.`;
}

/** One task field, drawn the way its kind asks to be drawn. */
function PlainField({
  field,
  value,
  onChange,
}: {
  field: TaskField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.kind === 'number') {
    return (
      <Field
        label={field.label}
        type="number"
        inputMode="decimal"
        min={field.min}
        max={field.max}
        step={field.step}
        hint={field.help}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.kind === 'lyrics') {
    return <LyricsEditor label={field.label} hint={field.help} value={value} onChange={onChange} />;
  }

  return (
    <TextArea
      label={field.label}
      rows={3}
      hint={field.help}
      placeholder="cinematic synth pop with clear vocals"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
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
  const [taskId, setTaskId] = useState<string | undefined>();
  const [modelId, setModelId] = useState<string | undefined>();
  const [values, setValues] = useState<Values>({});
  const [title, setTitle] = useState('');
  const [builder, setBuilder] = useState<StudioState>(EMPTY_STUDIO);
  const [mode, setMode] = useState<Mode>('guided');
  const [submitting, setSubmitting] = useState(false);

  // An accepted expansion replaces the prompt that is sent and keeps the one it
  // came from, which is what the job records as the original.
  const [enhanced, setEnhanced] = useState<{ original: string; text: string } | undefined>();
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<PromptSuggestion | undefined>();
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestError, setSuggestError] = useState<string | undefined>();

  const task = tasks.find((entry) => entry.id === taskId) ?? tasks[0];
  const packages = useMemo(() => (task ? packagesFor(catalog, task) : []), [catalog, task]);
  const installed = packages.filter((entry) => entry.installed);

  const chosenModel = modelId ?? installed[0]?.id;
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

  const written = guided ? compilePrompt(builder) : (fieldValues.prompt ?? '').trim();

  // An expansion stops applying the moment the form it was made from changes,
  // because a prompt written for a different style is not an expansion of this
  // one any more.
  const stale = enhanced !== undefined && enhanced.original !== written;
  const prompt = enhanced !== undefined && !stale ? enhanced.text : written;
  const instrumental = guided && !wantsLyrics(builder);

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
    return (fieldValues[field.name] ?? '').trim() === '';
  });

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
      originalPrompt: prompt === written ? undefined : written,
    });
    setSubmitting(false);

    // The form stays on a success, because the next thing people do is change
    // one word and run it again. Only the queue tells them it worked.
    if (ok) return;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        {guidedAvailable ? (
          <SegmentedControl
            label="Prompt"
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

        <label className="flex min-w-52 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Model</span>
          <select
            value={chosenModel ?? ''}
            disabled={installed.length === 0}
            onChange={(event) => setModelId(event.target.value)}
            className="min-h-11 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-45"
          >
            {installed.length === 0 ? (
              <option value="">No model installed</option>
            ) : (
              installed.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                  {entry.recommended ? ' (recommended)' : ''}
                </option>
              ))
            )}
          </select>
          <span className="text-sm text-ink-faint">
            {describeEstimate(
              chosenModel ? estimateSeconds(jobs, task.id, chosenModel) : undefined,
            )}
          </span>
        </label>
      </div>

      {tasks.length > 1 ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Task</span>
          <select
            value={task.id}
            onChange={(event) => {
              setTaskId(event.target.value);
              setValues({});
              setModelId(undefined);
            }}
            className="min-h-11 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink hover:border-line-strong"
          >
            {tasks.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <Field
        label="Song title"
        placeholder="Midnight Drive"
        hint="What the take is called in your library. Not sent to the model."
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />

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
        onAccept={(next) => setEnhanced({ original: written, text: next })}
        onClose={() => {
          setSuggesting(false);
          setSuggestion(undefined);
          setSuggestError(undefined);
        }}
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

      {installed.length === 0 && !catalogLoading ? (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
          {task.label} needs a {task.family.replace('_', ' ')} model, and none is installed.{' '}
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
      <div className="sticky bottom-0 -mx-5 mt-1 border-t border-line bg-canvas px-5 py-3">
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
