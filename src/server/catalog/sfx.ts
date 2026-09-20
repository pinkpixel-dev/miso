/**
 * Which packages of a family are sound effect models rather than music ones.
 *
 * Stable Audio 3 ships both in one spec: three SFX packages sit beside its
 * music packages under one `family`, and nothing in the spec marks them apart
 * except their ids. Two places need that distinction and they must not drift.
 * `generate.stableaudio` uses it to keep an SFX package off the music task,
 * where it would look like another precision and quietly produce a sound
 * effect instead of a track. The catalog uses it to give them their own card,
 * because folded in with eight other versions nobody finds them.
 *
 * The id is the only honest signal available. `tasks` is declared per family,
 * not per package, so it says this family does sfx without saying which
 * packages do.
 */
export function isSfxPackage(packageId: string): boolean {
  return packageId.includes('_sfx_');
}
