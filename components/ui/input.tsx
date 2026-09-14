import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-xl border border-white/[0.08] bg-[#0A0A0C] px-4 py-2 text-sm text-zinc-200',
          'placeholder:text-zinc-600',
          'transition-all duration-200 ease-out',
          'focus:border-white/[0.18] focus:outline-none focus:ring-0',
          'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
          'disabled:cursor-not-allowed disabled:opacity-40',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
