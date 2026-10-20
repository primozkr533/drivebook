import { Fragment } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<>"]+)/g;
// Sentence punctuation right after a link belongs to the text, not the URL.
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

export type TextPart = { kind: "text"; value: string } | { kind: "link"; value: string };

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const push = (kind: TextPart["kind"], value: string) => value && parts.push({ kind, value });
  text.split(URL_PATTERN).forEach((chunk, i) => {
    if (i % 2 === 0) return push("text", chunk);
    const trailing = TRAILING_PUNCTUATION.exec(chunk)?.[0] ?? "";
    push("link", chunk.slice(0, chunk.length - trailing.length));
    push("text", trailing);
  });
  return parts;
}

export function TextBody({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words font-mono text-caption text-ink-2">
      {splitLinks(text).map((part, i) =>
        part.kind === "link" ? (
          <a
            key={i}
            href={part.value}
            data-testid="inbox-link"
            className="text-ink underline decoration-line decoration-2 underline-offset-4 hover:decoration-signal"
          >
            {part.value}
          </a>
        ) : (
          <Fragment key={i}>{part.value}</Fragment>
        ),
      )}
    </p>
  );
}
