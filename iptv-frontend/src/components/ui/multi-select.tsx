"use client";

import * as React from "react";
import { X, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface MultiSelectOption {
  label: string;
  value: string;
  isPrimary?: boolean;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  onPrimaryChange?: (value: string | null) => void;
  primaryValue?: string | null;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  allowPrimary?: boolean;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  onPrimaryChange,
  primaryValue,
  placeholder = "Select items...",
  emptyText = "No results found.",
  className,
  disabled = false,
  allowPrimary = false,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleUnselect = (value: string) => {
    const newSelected = selected.filter((s) => s !== value);
    onChange(newSelected);
    
    // If we removed the primary, clear it or set to first remaining
    if (allowPrimary && onPrimaryChange && primaryValue === value) {
      onPrimaryChange(newSelected.length > 0 ? newSelected[0] : null);
    }
  };

  const handleSelect = (value: string) => {
    const isSelected = selected.includes(value);
    let newSelected: string[];
    
    if (isSelected) {
      newSelected = selected.filter((s) => s !== value);
      // If we removed the primary, clear it or set to first remaining
      if (allowPrimary && onPrimaryChange && primaryValue === value) {
        onPrimaryChange(newSelected.length > 0 ? newSelected[0] : null);
      }
    } else {
      newSelected = [...selected, value];
      // If this is the first item and allowPrimary, make it primary
      if (allowPrimary && onPrimaryChange && selected.length === 0) {
        onPrimaryChange(value);
      }
    }
    
    onChange(newSelected);
  };

  const handleSetPrimary = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (allowPrimary && onPrimaryChange) {
      onPrimaryChange(primaryValue === value ? null : value);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          <div className="flex gap-1 flex-wrap">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selected.map((value) => {
                const option = options.find((o) => o.value === value);
                const isPrimary = allowPrimary && primaryValue === value;
                return (
                  <Badge
                    variant={isPrimary ? "default" : "secondary"}
                    key={value}
                    className="mr-1 mb-1"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    {option?.label || value}
                    <button
                      className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleUnselect(value);
                        }
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnselect(value);
                      }}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </Badge>
                );
              })
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandEmpty>{emptyText}</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {options.map((option) => {
              const isSelected = selected.includes(option.value);
              const isPrimary = allowPrimary && primaryValue === option.value;
              
              return (
                <CommandItem
                  key={option.value}
                  onSelect={() => handleSelect(option.value)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-2 flex-1">
                    <Check
                      className={cn(
                        "h-4 w-4",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span>{option.label}</span>
                    {isPrimary && (
                      <Badge variant="default" className="ml-auto text-xs">
                        Primary
                      </Badge>
                    )}
                  </div>
                  {allowPrimary && isSelected && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 ml-2"
                      onClick={(e) => handleSetPrimary(option.value, e)}
                    >
                      {isPrimary ? "★" : "☆"}
                    </Button>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
