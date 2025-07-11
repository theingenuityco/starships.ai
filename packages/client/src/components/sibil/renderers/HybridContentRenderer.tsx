'use client'

import React from 'react'
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

interface HybridContentRendererProps {
  content: string;
  structured_content?: ContentBlock[];
  isStreaming?: boolean;
}

export function HybridContentRenderer({ 
  content, 
  structured_content, 
  isStreaming = false 
}: HybridContentRendererProps) {
  // If no structured content, just render the plain text
  if (!structured_content || structured_content.length === 0) {
    return <p className="text-sm whitespace-pre-wrap">{content}</p>;
  }

  // If streaming, show the typewriter text until complete
  if (isStreaming) {
    return <p className="text-sm whitespace-pre-wrap">{content}</p>;
  }

  // When streaming is complete, we need to render a hybrid view
  // that preserves the full text but renders structured components inline
  return (
    <div className="space-y-3">
      {renderHybridContent(content, structured_content)}
    </div>
  );
}

function renderHybridContent(fullContent: string, blocks: ContentBlock[]) {
  const elements: React.ReactElement[] = [];
  let lastIndex = 0;
  let elementKey = 0;

  // Sort blocks by their position in the content (if we can detect it)
  const sortedBlocks = [...blocks].sort((a, b) => {
    const aIndex = fullContent.indexOf(a.content);
    const bIndex = fullContent.indexOf(b.content);
    return aIndex - bIndex;
  });

  for (const block of sortedBlocks) {
    const blockIndex = fullContent.indexOf(block.content, lastIndex);
    
    if (blockIndex === -1) {
      // If we can't find the block content in the full text, skip it
      continue;
    }

    // Add any text before this block
    if (blockIndex > lastIndex) {
      const textBefore = fullContent.slice(lastIndex, blockIndex);
      if (textBefore.trim()) {
        elements.push(
          <p key={`text-${elementKey++}`} className="text-sm whitespace-pre-wrap">
            {textBefore}
          </p>
        );
      }
    }

    // Add the structured block
    switch (block.type) {
      case 'code':
        elements.push(
          <CodeBlockRenderer
            key={`code-${elementKey++}`}
            code={block.content}
            language={block.metadata?.language || 'text'}
          />
        );
        break;
      case 'table':
        elements.push(
          <TableRenderer
            key={`table-${elementKey++}`}
            content={block.content}
            headers={block.metadata?.headers}
          />
        );
        break;
      case 'markdown':
        elements.push(
          <MarkdownRenderer
            key={`markdown-${elementKey++}`}
            content={block.content}
          />
        );
        break;
      default:
        elements.push(
          <p key={`default-${elementKey++}`} className="text-sm whitespace-pre-wrap">
            {block.content}
          </p>
        );
    }

    lastIndex = blockIndex + block.content.length;
  }

  // Add any remaining text after the last block
  if (lastIndex < fullContent.length) {
    const textAfter = fullContent.slice(lastIndex);
    if (textAfter.trim()) {
      elements.push(
        <p key={`text-final-${elementKey++}`} className="text-sm whitespace-pre-wrap">
          {textAfter}
        </p>
      );
    }
  }

  // If no elements were created (couldn't match blocks), fall back to full content
  if (elements.length === 0) {
    return (
      <p className="text-sm whitespace-pre-wrap">
        {fullContent}
      </p>
    );
  }

  return <>{elements}</>;
}