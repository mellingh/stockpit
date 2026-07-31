import * as React from 'react';
import { cn } from '@/lib/utils';

/** Standard-Eingabefeld: 40px aus der Höhen-Skala */
function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-control-md w-full rounded-sm border border-line-strong bg-bg px-3.5 text-base text-ink outline-none transition-all duration-150',
        'placeholder:text-ink3 focus:border-accent focus:ring-2 focus:ring-accent/25',
        className
      )}
      {...props}
    />
  );
}

export { Input };
