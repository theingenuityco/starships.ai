'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
// Simple className utility
function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export interface CopyPageButtonProps {
  className?: string;
}

export function CopyPageButton({ className }: CopyPageButtonProps) {
  const [copied, setCopied] = useState(false);

  const copyPageContent = async () => {
    try {
      // Get the main content area - fumadocs uses specific selectors
      const contentElement = document.querySelector('[data-docs-content]') || 
                           document.querySelector('main') ||
                           document.querySelector('article') ||
                           document.querySelector('.prose');
      
      if (!contentElement) {
        throw new Error('Content not found');
      }

      // Extract text content while preserving some structure
      let content = '';
      
      // Get all text elements and filter out navigation/non-content
      const elements = contentElement.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, pre, blockquote');
      
      const processedTexts = new Set();
      
      for (const element of elements) {
        // Skip if it's in navigation, sidebar, footer, or other non-content areas
        if (element.closest('nav') || 
            element.closest('.navigation') ||
            element.closest('[role="navigation"]') ||
            element.closest('aside') ||
            element.closest('footer') ||
            element.closest('[data-sidebar]') ||
            element.closest('.toc') ||
            element.closest('.table-of-contents') ||
            element.closest('.mermaid') ||
            element.closest('svg') ||
            element.closest('[data-rehype-pretty-code-fragment]') ||
            element.classList.contains('copy-page-button')) {
          continue;
        }
        
        const tagName = element.tagName.toLowerCase();
        const text = element.textContent?.trim();
        
        if (!text || processedTexts.has(text)) continue;
        
        // Skip mermaid diagram text and navigation elements
        const skipTexts = ['Yes', 'No', 'start:', 'end:', 'llm:', 'tool:', 'conditional:', 'mutate:', 'On this page'];
        if (skipTexts.some(skip => text.includes(skip)) && text.length < 100) {
          continue;
        }
        
        // Skip if this looks like navigation text (short and contains certain patterns)
        if (text.length < 50 && (
          text.includes('→') || 
          text.includes('Visual workflow')
        )) {
          continue;
        }
        
        processedTexts.add(text);
        
        // Add appropriate formatting based on element type
        if (tagName.startsWith('h')) {
          const level = parseInt(tagName.charAt(1));
          const prefix = '#'.repeat(level);
          content += `${prefix} ${text}\n\n`;
        } else if (tagName === 'p') {
          content += `${text}\n\n`;
        } else if (tagName === 'li') {
          content += `- ${text}\n`;
        } else if (tagName === 'pre') {
          content += `\`\`\`\n${text}\n\`\`\`\n\n`;
        } else if (tagName === 'blockquote') {
          content += `> ${text}\n\n`;
        }
      }

      // Clean up extra whitespace
      content = content.replace(/\n{3,}/g, '\n\n').trim();

      await navigator.clipboard.writeText(content);
      setCopied(true);
      
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy page content:', error);
      // Fallback: try to copy just the visible text
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        const contentElement = document.querySelector('main') || document.body;
        range.selectNodeContents(contentElement);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand('copy');
        selection?.removeAllRanges();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackError) {
        console.error('Fallback copy failed:', fallbackError);
      }
    }
  };

  return (
    <button
      onClick={copyPageContent}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      title={copied ? 'Copied!' : 'Copy page content'}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          Copy page
        </>
      )}
    </button>
  );
}