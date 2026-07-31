import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-control-md w-full rounded-md border border-line-strong bg-bg px-3 text-base text-ink outline-none transition-colors duration-150',
        'placeholder:text-ink3 hover:border-ink3 focus:border-accent',
        className
      )}
      {...props}
    />
  );
}

export { Input };
