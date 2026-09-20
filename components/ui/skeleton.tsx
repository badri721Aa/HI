import { cn } from '@/lib/utils'

// ─── Base shimmer ───

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** rounded-md default */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
}

export function Skeleton({ className, rounded = 'md', ...props }: SkeletonProps) {
  const r = rounded === 'none' ? '' :
    rounded === 'sm' ? 'rounded-sm' :
    rounded === 'md' ? 'rounded-md' :
    rounded === 'lg' ? 'rounded-lg' :
    rounded === 'xl' ? 'rounded-xl' :
    rounded === '2xl' ? 'rounded-2xl' : 'rounded-full'
  return (
    <div
      className={cn('relative overflow-hidden', r, className)}
      style={{ background: 'rgba(255,255,255,0.03)' }}
      {...props}
    >
      <div
        className="absolute inset-0 -translate-x-full motion-safe:animate-[shimmer_1.8s_ease-in-out_infinite]"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)',
        }}
      />
    </div>
  )
}

// ─── Common shapes ───

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: '#050506', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10" rounded="xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-2 w-2/5" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  )
}

export function SkeletonAvatar({ size = 32 }: { size?: number }) {
  return <Skeleton rounded="full" style={{ height: size, width: size }} />
}
