import { NavigationModule } from './modules/NavigationModule';

interface CommandDeckNavigationProps {
  visibility: 'collapsed' | 'partial' | 'expanded';
  onExpand: () => void;
  onCollapse: () => void;
  isMobile?: boolean;
}

export function CommandDeckNavigation({ 
  visibility, 
  onExpand, 
  onCollapse, 
  isMobile = false 
}: CommandDeckNavigationProps) {
  return (
    <NavigationModule
      mode="sidebar"
      visibility={visibility}
      onExpand={onExpand}
      onCollapse={onCollapse}
      isMobile={isMobile}
    />
  );
} 