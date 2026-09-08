export function SiteFooter() {
  return (
    <footer
      id="docs"
      className="border-t border-border bg-background px-5 py-10 sm:px-10"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          ModLab
        </p>
        <p className="text-xs text-muted-foreground">
          Built with shadcn/ui, Tailwind, and React Three Fiber.
        </p>
      </div>
    </footer>
  )
}
