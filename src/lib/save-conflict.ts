import { UUID } from "crypto";
import { Character } from "src/lib/types/character";

// A refused write to shared storage: someone else's save landed after our
// last read, so ours would silently erase it. Carries their copy so the
// resolution surface can offer both versions.
export class SaveConflictError extends Error {
  constructor(
    public readonly uuid: UUID,
    public readonly theirs: Character,
    public readonly remoteRevision: string,
  ) {
    super("The stored copy changed since it was last read.");
    this.name = "SaveConflictError";
  }
}

export const isSaveConflictError = (
  error: unknown,
): error is SaveConflictError => error instanceof SaveConflictError;
