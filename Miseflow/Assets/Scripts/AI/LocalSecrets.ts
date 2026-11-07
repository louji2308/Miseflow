// Commit-safe stub (tracked). Empty = live AI disabled. tools/sync-env.ps1 overwrites this locally from .env
// and marks it git skip-worktree so a real key cannot be committed. Run tools/sync-env.ps1 -Reset to restore.
// Warning: a key embedded in a Lens is extractable. Local preview/recording only; never publish.
export const ANTHROPIC_API_KEY = "";
