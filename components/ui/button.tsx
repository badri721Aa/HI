import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] select-none',
  {
    variants: {
      variant: {
        default: [
          'border border-white/[0.09] bg-white/[0.05]',
          'text-zinc-200',
          'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]',
          'hover:bg-white/[0.09] hover:border-white/[0.14] hover:text-zinc-100',
        ].join(' '),
        solid: [
          'bg-zinc-100 text-zinc-950 font-semibold',
          'shadow-[0_1px_2px_rgba(0,0,0,0.4)]',
          'hover:bg-white',
        ].join(' '),
        ghost: 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]',
        danger: [
          'border border-rose-500/20 bg-rose-500/[0.07]',
          'text-rose-400',
          'hover:bg-rose-500/[0.12] hover:border-rose-500/30 hover:text-rose-300',
        ].join(' '),
        gold: [
          'border border-amber-500/25 bg-amber-500/[0.08]',
          'text-amber-400',
          'hover:bg-amber-500/[0.14] hover:border-amber-500/35 hover:text-amber-300',
        ].join(' '),
        emerald: [
          'border border-emerald-500/25 bg-emerald-500/[0.08]',
          'text-emerald-400',
          'hover:bg-emerald-500/[0.14] hover:border-emerald-500/35 hover:text-emerald-300',
        ].join(' '),
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-7 px-3 text-xs rounded-lg',
        lg: 'h-11 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
