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
    <div className="space-y-3 w-full overflow-hidden">
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
  
  // 3. ENHANCED: Detect incomplete code blocks immediately when streaming
  if (isStreaming) {
    // Find code blocks that start with ``` but don't have a closing ```
    const tempRegex = /```(\w+)?\n/g;
    let match;
    
    while ((match = tempRegex.exec(content)) !== null) {
      const startIndex = match.index;
      const openingLength = match[0].length;
      const afterMatch = content.substring(startIndex + openingLength);
      
      // Check if there's a closing ``` for this opening
      const closingMatch = afterMatch.match(/^([\s\S]*?)\n```/);
      
      if (!closingMatch) {
        // No closing ``` found, this is an incomplete code block
        // Only include content that's actually part of the code block
        const isAlreadyCaptured = segments.some(seg =>
          seg.type === 'code' &&
          seg.startIndex <= startIndex &&
          seg.endIndex > startIndex
        );
        
        if (!isAlreadyCaptured) {
          segments.push({
            type: 'code',
            content: afterMatch,
            startIndex: startIndex,
            endIndex: content.length, // Only to end of current content
            language: match[1] || 'text'
          });
        }
      }
    }
    
    // 4. ENHANCED: Detect incomplete tables during streaming
    // Look for table patterns that haven't been captured as complete
    const incompleteTableRegex = /(\|[^|\n]*\|)(\n\|[-\s|]*\|)?(\n((?:\|[^|\n]*\|\n?)*))?(?!\n\|[-\s|]*\|)$/m;
    const incompleteTableMatch = content.match(incompleteTableRegex);
    
    if (incompleteTableMatch && incompleteTableMatch.index !== undefined) {
      // Only treat as table if we have at least a header row with multiple columns
      const headerRow = incompleteTableMatch[1];
      const columnCount = (headerRow.match(/\|/g) || []).length - 1;
      
      if (columnCount >= 2) { // At least 2 columns to be considered a table
        // Check if this incomplete table is not already captured as complete
        const isAlreadyCaptured = segments.some(seg =>
          seg.type === 'table' &&
          seg.startIndex <= incompleteTableMatch.index! &&
          seg.endIndex >= incompleteTableMatch.index! + incompleteTableMatch[0].length
        );
        
        if (!isAlreadyCaptured) {
          const headers = headerRow.split('|').map(h => h.trim()).filter(Boolean);
          segments.push({
            type: 'table',
            content: incompleteTableMatch[0],
            startIndex: incompleteTableMatch.index,
            endIndex: incompleteTableMatch.index + incompleteTableMatch[0].length,
            headers
          });
        }
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