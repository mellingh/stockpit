import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Höhen strikt aus der Skala (siehe index.css):
 *   sm = 32px (Pills, kompakte Aktionen) · md = 40px (Standard) · icon = 32px
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium cursor-pointer transition-all duration-150 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-accent text-[#0b1524] font-semibold hover:brightness-110 active:translate-y-px shadow-[0_0_0_1px_rgba(107,165,255,0.35),0_6px_16px_rgba(107,165,255,0.18)]',
        ghost:
          'border border-line-strong bg-transparent text-ink2 hover:text-ink hover:border-ink3 hover:bg-panel2',
        danger:
          'border border-down/40 bg-transparent text-down hover:bg-down-soft hover:border-down',
        subtle: 'bg-panel2 text-ink2 border border-line hover:text-ink hover:border-line-strong',
        icon: 'bg-transparent text-ink3 hover:text-ink hover:bg-panel2 rounded-md',
      },
      size: {
        md: 'h-control-md px-5 text-base',
        sm: 'h-control-sm px-3.5 text-small',
        icon: 'h-control-sm w-control-sm p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
);

function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
