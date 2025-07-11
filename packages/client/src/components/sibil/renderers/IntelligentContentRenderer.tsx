'use client'

import React, { useMemo } from 'react'
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

interface IntelligentContentRendererProps {
  content: string;
  structured_content?: ContentBlock[];
  isStreaming?: boolean;
}

interface ParsedSegment {
  type: 'markdown' | 'code' | 'table';
  content: string;
  startIndex: number;
  endIndex: number;
  language?: string;
  headers?: string[];
}

export function IntelligentContentRenderer({ 
  content, 
  structured_content, 
  isStreaming = false 
}: IntelligentContentRendererProps) {
  
  const parsedSegments = useMemo(() => {
    return parseContentInRealTime(content, isStreaming);
  }, [content, isStreaming]);

  return (
    <div className="space-y-3">
      {renderIntelligentContent(content, parsedSegments)}
    </div>
  );
}

function parseContentInRealTime(content: string, isStreaming: boolean): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  
  // 1. Detect complete code blocks (even during streaming)
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    segments.push({
      type: 'code',
      content: match[2].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      language: match[1] || 'text'
    });
  }
  
  // 2. Detect complete tables (even during streaming)
  const tableRegex = /\|(.+)\|\n\|[-\s|]+\|\n((?:\|.+\|\n?)+)/g;
  while ((match = tableRegex.exec(content)) !== null) {
    const headers = match[1].split('|').map(h => h.trim()).filter(Boolean);
    segments.push({
      type: 'table',
      content: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      headers
    });
  }
  
  // 3. If streaming, also detect incomplete code blocks that are being typed
  if (isStreaming) {
    const incompleteCodeRegex = /```(\w+)?\n([\s\S]*)$/;
    const incompleteMatch = content.match(incompleteCodeRegex);
    
    if (incompleteMatch && incompleteMatch.index !== undefined) {
      // Check if this incomplete block is not already captured as complete
      const isAlreadyCaptured = segments.some(seg => 
        seg.startIndex <= incompleteMatch.index! && 
        seg.endIndex >= incompleteMatch.index! + incompleteMatch[0].length
      );
      
      if (!isAlreadyCaptured) {
        segments.push({
          type: 'code',
          content: incompleteMatch[2],
          startIndex: incompleteMatch.index,
          endIndex: incompleteMatch.index + incompleteMatch[0].length,
          language: incompleteMatch[1] || 'text'
        });
      }
    }
  }
  
  // Sort segments by start index
  return segments.sort((a, b) => a.startIndex - b.startIndex);
}

function renderIntelligentContent(fullContent: string, segments: ParsedSegment[]) {
  if (segments.length === 0) {
    // No special segments, render everything as markdown
    return <MarkdownRenderer content={fullContent} />;
  }
  
  const elements: React.ReactElement[] = [];
  let lastIndex = 0;
  let elementKey = 0;
  
  for (const segment of segments) {
    // Add markdown content before this segment
    if (segment.startIndex > lastIndex) {
      const markdownBefore = fullContent.slice(lastIndex, segment.startIndex);
      if (markdownBefore.trim()) {
        elements.push(
          <MarkdownRenderer
            key={`markdown-${elementKey++}`}
            content={markdownBefore}
          />
        );
      }
    }
    
    // Add the specialized component
    switch (segment.type) {
      case 'code':
        elements.push(
          <CodeBlockRenderer
            key={`code-${elementKey++}`}
            code={segment.content}
            language={segment.language || 'text'}
          />
        );
        break;
      case 'table':
        elements.push(
          <TableRenderer
            key={`table-${elementKey++}`}
            content={segment.content}
            headers={segment.headers}
          />
        );
        break;
      default:
        elements.push(
          <MarkdownRenderer
            key={`markdown-${elementKey++}`}
            content={segment.content}
          />
        );
    }
    
    lastIndex = segment.endIndex;
  }
  
  // Add any remaining markdown content after the last segment
  if (lastIndex < fullContent.length) {
    const markdownAfter = fullContent.slice(lastIndex);
    if (markdownAfter.trim()) {
      elements.push(
        <MarkdownRenderer
          key={`markdown-final-${elementKey++}`}
          content={markdownAfter}
        />
      );
    }
  }
  
  return <>{elements}</>;
}