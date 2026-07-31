import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-sm border border-line-strong bg-bg px-3 text-[13.5px] text-ink outline-none transition-all duration-150',
        'placeholder:text-ink3 focus:border-ink3',
        className
      )}
      {...props}
    />
  );
}

export { Input };
