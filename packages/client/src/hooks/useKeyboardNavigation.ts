import { useEffect, useCallback, useRef } from 'react';

interface KeyboardNavigationOptions {
  onEscape?: () => void;
  onEnter?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  onTab?: (direction: 'forward' | 'backward') => void;
  isEnabled?: boolean;
  trapFocus?: boolean;
}

export function useKeyboardNavigation(options: KeyboardNavigationOptions = {}) {
  const {
    onEscape,
    onEnter,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    onTab,
    isEnabled = true,
    trapFocus = false
  } = options;

  const containerRef = useRef<HTMLElement>(null);
  const focusableElementsRef = useRef<HTMLElement[]>([]);

  // Get all focusable elements within container
  const updateFocusableElements = useCallback(() => {
    if (!containerRef.current) return;

    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '[role="button"]:not([disabled])',
      '[role="link"]:not([disabled])'
    ].join(', ');

    const elements = Array.from(
      containerRef.current.querySelectorAll(focusableSelectors)
    ) as HTMLElement[];

    focusableElementsRef.current = elements.filter(
      el => !el.hasAttribute('aria-hidden') && el.offsetParent !== null
    );
  }, []);

  // Focus management utilities
  const focusFirst = useCallback(() => {
    updateFocusableElements();
    const firstElement = focusableElementsRef.current[0];
    if (firstElement) {
      firstElement.focus();
      return true;
    }
    return false;
  }, [updateFocusableElements]);

  const focusLast = useCallback(() => {
    updateFocusableElements();
    const elements = focusableElementsRef.current;
    const lastElement = elements[elements.length - 1];
    if (lastElement) {
      lastElement.focus();
      return true;
    }
    return false;
  }, [updateFocusableElements]);

  const focusNext = useCallback(() => {
    updateFocusableElements();
    const elements = focusableElementsRef.current;
    const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
    
    if (currentIndex >= 0 && currentIndex < elements.length - 1) {
      elements[currentIndex + 1].focus();
      return true;
    } else if (trapFocus && elements.length > 0) {
      elements[0].focus(); // Wrap to first
      return true;
    }
    return false;
  }, [updateFocusableElements, trapFocus]);

  const focusPrevious = useCallback(() => {
    updateFocusableElements();
    const elements = focusableElementsRef.current;
    const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
    
    if (currentIndex > 0) {
      elements[currentIndex - 1].focus();
      return true;
    } else if (trapFocus && elements.length > 0) {
      elements[elements.length - 1].focus(); // Wrap to last
      return true;
    }
    return false;
  }, [updateFocusableElements, trapFocus]);

  // Keyboard event handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isEnabled) return;

    // Prevent default for navigation keys to avoid page scrolling
    const navigationKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape'];
    if (navigationKeys.includes(event.key)) {
      // Allow default Tab behavior unless we're handling it
      if (event.key !== 'Tab' || onTab || trapFocus) {
        event.preventDefault();
      }
    }

    switch (event.key) {
      case 'Escape':
        onEscape?.();
        break;
        
      case 'Enter':
      case ' ': // Space bar
        if (event.key === ' ' && event.target instanceof HTMLInputElement) {
          // Allow default space in inputs
          return;
        }
        onEnter?.();
        break;
        
      case 'ArrowUp':
        if (onArrowUp) {
          onArrowUp();
        } else {
          focusPrevious();
        }
        break;
        
      case 'ArrowDown':
        if (onArrowDown) {
          onArrowDown();
        } else {
          focusNext();
        }
        break;
        
      case 'ArrowLeft':
        if (onArrowLeft) {
          onArrowLeft();
        } else {
          focusPrevious();
        }
        break;
        
      case 'ArrowRight':
        if (onArrowRight) {
          onArrowRight();
        } else {
          focusNext();
        }
        break;
        
      case 'Tab':
        if (onTab) {
          onTab(event.shiftKey ? 'backward' : 'forward');
        } else if (trapFocus) {
          if (event.shiftKey) {
            if (!focusPrevious()) {
              focusLast();
            }
          } else {
            if (!focusNext()) {
              focusFirst();
            }
          }
        }
        break;
        
      case 'Home':
        event.preventDefault();
        focusFirst();
        break;
        
      case 'End':
        event.preventDefault();
        focusLast();
        break;
    }
  }, [
    isEnabled,
    onEscape,
    onEnter,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    onTab,
    trapFocus,
    focusFirst,
    focusLast,
    focusNext,
    focusPrevious
  ]);

  // Set up event listeners
  useEffect(() => {
    if (!isEnabled) return;

    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      return () => {
        container.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [handleKeyDown, isEnabled]);

  // Update focusable elements when container changes
  useEffect(() => {
    updateFocusableElements();
  }, [updateFocusableElements]);

  return {
    containerRef,
    focusFirst,
    focusLast,
    focusNext,
    focusPrevious,
    focusableElementsCount: focusableElementsRef.current.length
  };
} 