export function register(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  import("@/lib/agent/pipeline")
    .then(({ warmCatalog }) => warmCatalog())
    .catch(() => {});
}
