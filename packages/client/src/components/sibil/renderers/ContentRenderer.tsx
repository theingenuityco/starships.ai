'use client'

import { MarkdownRenderer } from './MarkdownRenderer'
import { CodeBlockRenderer } from './CodeBlockRenderer'
import { TableRenderer } from './TableRenderer'

interface ContentBlock {
  type: 'text' | 'markdown' | 'code' | 'table';
  content: string;
  metadata?: {
    language?: string;
    headers?: string[];
  };
}

interface ContentRendererProps {
  blocks: ContentBlock[]
}

export function ContentRenderer({ blocks }: ContentRendererProps) {
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'code':
            return (
              <CodeBlockRenderer
                key={index}
                code={block.content}
                language={block.metadata?.language || 'text'}
              />
            )
          case 'table':
            return (
              <TableRenderer
                key={index}
                content={block.content}
                headers={block.metadata?.headers}
              />
            )
          case 'markdown':
            return (
              <MarkdownRenderer
                key={index}
                content={block.content}
              />
            )
          default:
            return (
              <p key={index} className="text-sm whitespace-pre-wrap">
                {block.content}
              </p>
            )
        }
      })}
    </div>
  )
}