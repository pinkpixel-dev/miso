import { createContext, use } from 'react';
import type { Asset, Catalog, Job, Project, StudioState, StudioTask } from '../../shared/types.ts';
import type { ImportProgress } from './useProject.ts';

/**
 * The project the studio is pointed at, and everything that acts on it.
 *
 * This exists because the layout split one screen into three regions that all
 * need the same data. The create column writes jobs, the workspace lists the
 * takes those jobs produce, and the dock plays them. Before the redesign all
 * three were one route component and could share state by being one component.
 *
 * The provider is never keyed on the project id. Remounting on a project change
 * would take the dock down with it, which is the one thing the dock must
 * survive, so a change of project is a change of value here and nothing more.
 */
export interface StudioValue {
  projectId: string | undefined;
  project: Project | undefined;
  assets: Asset[];
  /** Complete job history, including finished jobs hidden from the queue. */
  allJobs: Job[];
  /** Jobs currently visible in the queue. */
  jobs: Job[];
  tasks: StudioTask[];
  catalog: Catalog | undefined;
  catalogLoading: boolean;
  loading: boolean;
  error: string | undefined;
  importing: ImportProgress | undefined;

  submit: (body: {
    taskId: string;
    modelId: string;
    params: Record<string, string | number>;
    title?: string;
    studio?: StudioState;
    originalPrompt?: string;
    /** Assets the task reads, by the role it gives them. Empty for generation. */
    inputs?: { assetId: string; role: string }[];
  }) => Promise<boolean>;
  cancelJob: (jobId: string) => void;
  /** Hides finished jobs. The rows stay, so a take can still show what made it. */
  dismissJobs: () => void;
  /** How many finished jobs the queue is holding back. */
  dismissedCount: number;
  importFile: (file: File) => void;
  renameProject: (name: string) => void;
  renameAsset: (assetId: string, label: string) => void;
  removeAsset: (assetId: string) => void;
  computePeaksFor: (assetId: string) => void;
  /**
   * Fetches the project's takes again.
   *
   * The queue already calls this when a job finishes. It is exposed for work
   * the service does without a job in the queue, which today is recombining
   * stems: the mix is written and answered in one request, so nothing else
   * would tell the list it had a new take in it.
   */
  reload: () => void;
}

export const StudioContext = createContext<StudioValue | undefined>(undefined);

export function useStudio(): StudioValue {
  const value = use(StudioContext);
  if (!value) throw new Error('useStudio needs a StudioProvider above it');
  return value;
}
