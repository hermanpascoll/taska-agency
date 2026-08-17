"use client";

import {
  type KeyboardEvent,
  type TextareaHTMLAttributes,
  useMemo,
  useRef,
  useState,
} from "react";
import { clsx } from "clsx";
import type { Person } from "@/lib/types";

type MentionTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  people: Person[];
};

export function MentionTextarea({
  value,
  onChange,
  people,
  className,
  onKeyDown,
  ...props
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{
    query: string;
    start: number;
    end: number;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLocaleLowerCase("es");
    return people
      .filter(
        (person) =>
          !person.deactivated &&
          (!query ||
            person.name.toLocaleLowerCase("es").includes(query) ||
            person.email?.toLocaleLowerCase("es").includes(query)),
      )
      .slice(0, 6);
  }, [mention, people]);

  const detectMention = (nextValue: string, cursor: number) => {
    const beforeCursor = nextValue.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/u);
    if (!match) {
      setMention(null);
      return;
    }
    setMention({
      query: match[1],
      start: cursor - match[1].length - 1,
      end: cursor,
    });
    setActiveIndex(0);
  };

  const selectPerson = (person: Person) => {
    if (!mention) return;
    const nextValue = `${value.slice(0, mention.start)}@${person.name} ${value.slice(mention.end)}`;
    const cursor = mention.start + person.name.length + 2;
    onChange(nextValue);
    setMention(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && suggestions.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          event.key === "ArrowDown"
            ? (current + 1) % suggestions.length
            : (current - 1 + suggestions.length) % suggestions.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectPerson(suggestions[activeIndex] ?? suggestions[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    onKeyDown?.(event);
  };

  return (
    <div className="relative">
      <textarea
        {...props}
        ref={textareaRef}
        value={value}
        className={className}
        onChange={(event) => {
          onChange(event.target.value);
          detectMention(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) =>
          detectMention(event.currentTarget.value, event.currentTarget.selectionStart)
        }
        onKeyDown={handleKeyDown}
      />
      {mention && suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 z-[160] mb-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
          <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
            Mencionar a
          </p>
          {suggestions.map((person, index) => (
            <button
              key={person.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectPerson(person)}
              className={clsx(
                "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left",
                index === activeIndex ? "bg-[#0a84ff]/10" : "hover:bg-slate-50",
              )}
            >
              <span
                className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full text-[9px] font-bold text-white"
                style={{ background: person.color }}
              >
                {person.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={person.avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  person.initials
                )}
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-[11px] text-slate-800">
                  {person.name}
                </strong>
                <span className="block truncate text-[9px] text-slate-400">
                  {person.email}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MentionedText({ text, people }: { text: string; people: Person[] }) {
  const names = people
    .map((person) => person.name)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  if (!names.length) return text;
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(@(?:${escaped.join("|")}))`, "gi"));
  return parts.map((part, index) =>
    part.startsWith("@") &&
    names.some((name) => name.toLocaleLowerCase("es") === part.slice(1).toLocaleLowerCase("es")) ? (
      <span key={`${part}-${index}`} className="font-semibold text-[#5aa7ff]">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
