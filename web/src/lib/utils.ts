import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// WICHTIG: tailwind-merge muss unsere eigenen Klassen kennen. Ohne diese
// Konfiguration hält es Farbklassen (text-up, text-accent, …) für
// Schriftgrößen und WIRFT die echte Größenklasse weg — Badges und KPI-Zahlen
// rendern dann in der geerbten Größe statt auf der Skala (Runde-10-Bug:
// "Badges zu groß, Zahlen zu klein", obwohl der Code richtig aussah).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['micro', 'small', 'base', 'lg', 'display-sm', 'display-md', 'display-lg'] },
      ],
      'text-color': [
        {
          text: [
            'ink', 'ink2', 'ink3', 'accent', 'up', 'down', 'warn', 'hoch',
            'line', 'line-strong', 'bg', 'panel', 'panel2', 'elevated',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
