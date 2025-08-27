import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Command Deck | Starships.ai',
  description: 'Starships.ai Command Deck - Mission control center for your starship operations'
};

export default function CommandDeckPage() {
  // Redirect to new ships route
  redirect('/fleet');
}