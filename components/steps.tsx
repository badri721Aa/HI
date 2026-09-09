interface Step {
  title: string
  children: React.ReactNode
}

export function Steps({ items }: { items: Step[] }) {
  return (
    <ol className="my-6 max-w-[660px] list-none">
      {items.map((step, i) => (
        <li key={step.title} className="relative flex gap-4 pb-5 last:pb-0">
          {i < items.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[15px] top-[34px] h-[calc(100%-8px)] w-px bg-border"
            />
          )}
          <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] font-[family-name:var(--font-mono)] text-[11px] text-[#00e5a0]">
            {i + 1}
          </span>
          <div className="pt-1">
            <p className="mb-1 text-sm font-semibold text-foreground">
              {step.title}
            </p>
            <div className="text-[13px] leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_code]:rounded [&_code]:border [&_code]:border-border [&_code]:bg-white/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-[family-name:var(--font-mono)] [&_code]:text-[12px] [&_code]:text-foreground [&_strong]:text-foreground">
              {step.children}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
