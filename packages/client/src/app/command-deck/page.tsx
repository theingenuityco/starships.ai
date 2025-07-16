import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import { StarshipDashboard } from '@/components/command-deck/starship/StarshipDashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Command Deck | Starships.ai',
  description: 'Starships.ai Command Deck - Mission control center for your starship operations'
};

export default function CommandDeckPage() {
  // Redirect to new ships route
  redirect('/ships');
}