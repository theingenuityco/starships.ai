import type { Metadata } from 'next';
import { CommandDeckContent } from '@/components/command-deck/CommandDeckContent';

export const metadata: Metadata = {
  title: 'Command Deck | Starships.ai',
  description: 'Starships.ai Command Deck - Mission control center for your starship operations'
};

export default function CommandDeckPage() {
  return <CommandDeckContent />;
}