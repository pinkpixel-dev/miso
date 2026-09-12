-- Phase 4: the song title and the prompt builder's own state.
--
-- Two columns rather than more params. Neither of these is sent to audio.cpp,
-- so neither belongs in params, which exists to be replayed into a request.
--
--   * title is what the person calls the song. Until now a take was named after
--     the first line of its prompt, which reads like a machine label on a track
--     list. The worker uses this instead when it is set.
--   * studio is the guided builder's form state: the chips that were selected,
--     the vocal mode, the tempo, the key. The prompt the model receives is
--     compiled from it and lives in params, and a compiled sentence cannot be
--     taken apart again. Keeping the state beside it is what lets a take be
--     reopened in the builder it was written in.
--
-- studio is opaque JSON on purpose. Its shape belongs to the client that wrote
-- it, and the service neither reads inside it nor queries on it.

ALTER TABLE jobs ADD COLUMN title TEXT;
ALTER TABLE jobs ADD COLUMN studio TEXT;
