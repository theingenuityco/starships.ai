import { NavigationModule } from './modules/NavigationModule';

interface CommandDeckNavigationProps {
  isMobile?: boolean;
}

export function CommandDeckNavigation({ isMobile = false }: CommandDeckNavigationProps) {
  return (
    <NavigationModule mode="sidebar" isMobile={isMobile} />
  );
} 