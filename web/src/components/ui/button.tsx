import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium cursor-pointer transition-[color,background-color,border-color,filter,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-accent text-[#06101f] font-semibold hover:brightness-115 active:translate-y-px shadow-[0_0_0_1px_rgba(94,158,255,0.4),0_8px_20px_rgba(94,158,255,0.16)]',
        ghost:
          'border border-line-strong bg-transparent text-ink2 hover:text-ink hover:border-ink3 hover:bg-panel2',
        danger:
          'border border-down/40 bg-transparent text-down hover:bg-down-soft hover:border-down',
        subtle: 'bg-panel2 text-ink2 border border-line hover:text-ink hover:border-line-strong',
        icon: 'bg-transparent text-ink3 hover:text-ink hover:bg-panel2 rounded-md',
      },
      size: {
        default: 'h-9 px-4 text-[13px]',
        sm: 'h-8 px-3 text-[12.5px]',
        xs: 'h-7 px-2.5 text-[12px]',
        icon: 'h-7 w-7 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
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
