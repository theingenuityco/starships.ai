import { useEffect } from 'react';
import { useStarshipStore } from '@/store/starship-store';

export function useCommandDeckKeyboard() {
  const { commandDeck, expandCommandDeck, collapseCommandDeck, setCommandDeckVisibility } = useStarshipStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl + K to toggle command deck expansion
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        if (commandDeck.visibility === 'expanded') {
          collapseCommandDeck();
        } else {
          expandCommandDeck();
        }
      }

      // Escape to collapse when expanded
      if (event.key === 'Escape' && commandDeck.visibility === 'expanded') {
        collapseCommandDeck();
      }

      // Alt + C to show/hide command deck (desktop only)
      if (event.altKey && event.key === 'c') {
        event.preventDefault();
        // On mobile, this will toggle between hidden and expanded
        // On desktop, this will toggle between collapsed and partial
        if (commandDeck.visibility === 'collapsed') {
          setCommandDeckVisibility('partial');
        } else if (commandDeck.visibility === 'partial') {
          setCommandDeckVisibility('collapsed');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandDeck.visibility, expandCommandDeck, collapseCommandDeck, setCommandDeckVisibility]);
} 