import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge our token-named scales so `text-body` (size) and
// `text-ink` (colour) are not treated as conflicting classes.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["micro", "caption", "small", "body", "lead", "h4", "h3", "h2", "h1", "display"] },
      ],
      shadow: [{ shadow: ["1", "2", "3"] }],
      rounded: [{ rounded: ["xs", "sm", "md", "lg", "pill"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
