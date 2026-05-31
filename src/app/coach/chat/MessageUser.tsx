'use client';

import type {UIMessage} from '@ai-sdk/react';

interface MessageUserProps {
  msg: UIMessage;
}

export function MessageUser({msg}: MessageUserProps) {
  const textPart = msg.parts.find((p): p is {type: 'text'; text: string} => p.type === 'text');
  if (!textPart?.text) return null;

  return (
    <div className="flex justify-end px-5 py-2">
      <div className="max-w-[72%] sm:max-w-[65%] rounded-2xl rounded-br-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-text-1)] leading-relaxed whitespace-pre-wrap">
        {textPart.text}
      </div>
    </div>
  );
}
