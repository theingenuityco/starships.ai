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
      
      // Get the title
      const title = document.querySelector('h1')?.textContent;
      if (title) {
        content += `# ${title}\n\n`;
      }

      // Get description if available
      const description = document.querySelector('p')?.textContent;
      if (description && description !== title) {
        content += `${description}\n\n`;
      }

      // Process the content element to extract meaningful text
      const walker = document.createTreeWalker(
        contentElement,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            // Skip script, style, and other non-content elements
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              const tagName = element.tagName.toLowerCase();
              if (['script', 'style', 'nav', 'button', 'svg'].includes(tagName)) {
                return NodeFilter.FILTER_REJECT;
              }
              
              // Include headings, paragraphs, lists, code blocks
              if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'pre', 'code', 'blockquote'].includes(tagName)) {
                return NodeFilter.FILTER_ACCEPT;
              }
            }
            
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent?.trim();
              if (text && text.length > 0) {
                return NodeFilter.FILTER_ACCEPT;
              }
            }
            
            return NodeFilter.FILTER_SKIP;
          }
        }
      );

      let currentNode = walker.nextNode();

      while (currentNode) {
        if (currentNode.nodeType === Node.ELEMENT_NODE) {
          const element = currentNode as Element;
          const tagName = element.tagName.toLowerCase();
          
          // Add appropriate formatting based on element type
          if (tagName.startsWith('h')) {
            const level = parseInt(tagName.charAt(1));
            const prefix = '#'.repeat(level);
            const text = element.textContent?.trim();
            if (text) {
              content += `\n${prefix} ${text}\n\n`;
            }
          } else if (tagName === 'p') {
            const text = element.textContent?.trim();
            if (text) {
              content += `${text}\n\n`;
            }
          } else if (tagName === 'li') {
            const text = element.textContent?.trim();
            if (text) {
              content += `- ${text}\n`;
            }
          } else if (tagName === 'pre' || tagName === 'code') {
            const text = element.textContent?.trim();
            if (text) {
              if (tagName === 'pre') {
                content += `\`\`\`\n${text}\n\`\`\`\n\n`;
              } else {
                content += `\`${text}\``;
              }
            }
          } else if (tagName === 'blockquote') {
            const text = element.textContent?.trim();
            if (text) {
              content += `> ${text}\n\n`;
            }
          }
        }
        
        currentNode = walker.nextNode();
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