import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Statische Kennzeichnung — feste Höhe 24px aus der Skala */
const badgeVariants = cva(
  'inline-flex h-control-xs items-center gap-1.5 rounded-full border px-3 font-mono text-micro font-medium tracking-wide whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-line-strong text-ink3',
        chip: 'border-accent/45 text-accent bg-accent-soft',
        pos: 'border-up/40 text-up bg-up-soft',
        neg: 'border-down/40 text-down bg-down-soft',
        neu: 'border-line-strong text-ink2 bg-panel2',
        warn: 'border-warn/40 text-warn bg-warn-soft',
        cat: 'border-accent/30 text-accent/90',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
