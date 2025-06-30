'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

interface SelectTriggerProps {
  className?: string;
  children: React.ReactNode;
}

interface SelectContentProps {
  children: React.ReactNode;
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
}

interface SelectValueProps {
  placeholder?: string;
}

const SelectContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}>({});

const Select: React.FC<SelectProps> = ({ value, onValueChange, children, disabled }) => {
  return (
    <SelectContext.Provider value={{ value, onValueChange, disabled }}>
      {children}
    </SelectContext.Provider>
  );
};

const SelectTrigger = React.forwardRef<HTMLDivElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
SelectTrigger.displayName = 'SelectTrigger';

const SelectValue: React.FC<SelectValueProps> = ({ placeholder }) => {
  const { value } = React.useContext(SelectContext);
  return <span>{value || placeholder}</span>;
};

const SelectContent: React.FC<SelectContentProps> = ({ children }) => {
  return (
    <div className="relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
      <div className="p-1">
        {children}
      </div>
    </div>
  );
};

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ value, children, ...props }, ref) => {
    const { onValueChange, value: selectedValue } = React.useContext(SelectContext);
    const isSelected = selectedValue === value;
    
    return (
      <div
        ref={ref}
        className={cn(
          'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
          isSelected && 'bg-accent text-accent-foreground'
        )}
        onClick={() => onValueChange?.(value)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SelectItem.displayName = 'SelectItem';

// Simple HTML select fallback for complex cases
const SimpleSelect = React.forwardRef<HTMLSelectElement, {
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}>(({ value, onValueChange, className, children, ...props }, ref) => (
  <select
    ref={ref}
    value={value}
    onChange={(e) => onValueChange?.(e.target.value)}
    className={cn(
      'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    {children}
  </select>
));
SimpleSelect.displayName = 'SimpleSelect';

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SimpleSelect,
}; 