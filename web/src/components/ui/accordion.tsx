import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const Accordion = AccordionPrimitive.Root;
const AccordionItem = AccordionPrimitive.Item;

/** Kompakter Aufklapp-Trigger im Stockpit-Stil (Chevron + Accent-Text) */
function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          'group flex cursor-pointer items-center gap-1.5 py-2 text-[12.5px] font-semibold text-accent outline-none transition-colors hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-accent/50 rounded-sm',
          className
        )}
        {...props}
      >
        <ChevronRight
          size={14}
          className="transition-transform duration-200 group-data-[state=open]:rotate-90"
        />
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      className={cn(
        'overflow-hidden data-[state=closed]:animate-[accordion-up_0.18s_ease-out] data-[state=open]:animate-[accordion-down_0.18s_ease-out]',
        className
      )}
      {...props}
    >
      {children}
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
