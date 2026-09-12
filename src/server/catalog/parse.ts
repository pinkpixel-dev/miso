/**
 * One vendored model_specs document to the shape Miso renders.
 *
 * The specs are pinned and read at startup, so this validates by failing loudly
 * rather than by pulling in a schema library. A parse error here means the
 * vendored commit moved under us, which is a thing we want to hear about at
 * boot rather than halfway down a settings screen.
 *
 * Only the fields the catalog and the job system use are read. Options,
 * sources, and dependencies are deliberately left alone: the advanced options
 * drawer needs them and will parse them then.
 */

export interface SpecPackage {
  /** The id the install routes take, for example ace_step_turbo_q8_0. */
  id: string;
  label: string;
  /** q8_0, bf16, f16, and so on. Drives the variant list on a card. */
  precision: string;
  /**
   * Where this package lands under the server's models root, relative to it.
   *
   * Loading a model with the target directory alone is not enough. ACE-Step
   * installs into ACE-Step1.5-GGUF/turbo, and pointing at ACE-Step1.5-GGUF
   * falls back to a safetensors source and fails on a missing file, which is
   * written up in DOCS/ERRORS.md. The variant subdirectory comes from the file
   * list, so it is derived here rather than guessed at the call site.
   */
  directory: string;
}

export interface ModelSpec {
  family: string;
  displayName: string;
  /** One line on what the model does. Falls back to the display name. */
  summary: string;
  tasks: string[];
  languages: string[];
  packages: SpecPackage[];
  recommendedPackageId: string | undefined;
}

function fail(filename: string, why: string): never {
  throw new Error(`${filename}: ${why}`);
}

function asRecord(value: unknown, filename: string, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(filename, `${where} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, filename: string, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(filename, `${where} must be a non-empty string`);
  return value;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Works out the directory a package installs into.
 *
 * Two shapes exist in the vendored specs. Most packages carry a strip_prefix
 * that repeats the target directory, so their file paths are already rooted
 * there and the part that matters is what follows. MiniMax Music 3 has no
 * strip_prefix and lists bare filenames, which land directly in the target
 * directory. Both end up as target_directory plus whatever directory the first
 * file sits in.
 */
function packageDirectory(pkg: Record<string, unknown>, filename: string, index: number): string {
  const target = asString(pkg.target_directory, filename, `packages[${index}].target_directory`);
  const files = Array.isArray(pkg.files) ? pkg.files.filter((f): f is string => typeof f === 'string') : [];
  const first = files[0];
  if (first === undefined) fail(filename, `packages[${index}].files must list at least one file`);

  const prefix = typeof pkg.strip_prefix === 'string' ? pkg.strip_prefix : undefined;
  const relative = prefix && first.startsWith(`${prefix}/`) ? first.slice(prefix.length + 1) : first;

  const slash = relative.lastIndexOf('/');
  return slash === -1 ? target : `${target}/${relative.slice(0, slash)}`;
}

function parsePackage(value: unknown, filename: string, index: number): SpecPackage {
  const pkg = asRecord(value, filename, `packages[${index}]`);
  const id = asString(pkg.id, filename, `packages[${index}].id`);
  const precision = asString(pkg.precision, filename, `packages[${index}].precision`);
  const label = typeof pkg.display_name === 'string' && pkg.display_name.trim() !== '' ? pkg.display_name : id;
  return { id, label, precision, directory: packageDirectory(pkg, filename, index) };
}

export function parseSpec(raw: unknown, filename: string): ModelSpec {
  const spec = asRecord(raw, filename, 'spec');

  const family = asString(spec.family, filename, 'family');
  const expected = filename.replace(/\.json$/, '');
  if (family !== expected) fail(filename, `family is "${family}" but the filename says "${expected}"`);

  const displayName = asString(spec.display_name, filename, 'display_name');

  const description =
    typeof spec.description === 'string' && spec.description.trim() !== '' ? spec.description : undefined;

  const rawPackages = Array.isArray(spec.packages) ? spec.packages : [];
  const packages = rawPackages.map((entry, index) => parsePackage(entry, filename, index));

  const ui = spec.ui === undefined ? {} : asRecord(spec.ui, filename, 'ui');
  const recommended = typeof ui.recommended_package === 'string' ? ui.recommended_package : undefined;

  if (recommended !== undefined && !packages.some((p) => p.id === recommended)) {
    fail(filename, `ui.recommended_package "${recommended}" is not one of this family's packages`);
  }

  return {
    family,
    displayName,
    summary: description ?? displayName,
    tasks: asStringArray(spec.tasks),
    languages: asStringArray(spec.languages),
    packages,
    recommendedPackageId: recommended,
  };
}
