import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface MultiSelectChipsProps<T extends string> {
  options: ReadonlyArray<ChipOption<T>>;
  value: T[];
  onChange: (next: T[]) => void;
}

export function MultiSelectChips<T extends string>({
  options,
  value,
  onChange
}: MultiSelectChipsProps<T>) {
  const toggle = (option: T) => {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
  };

  return (
    <View className='flex-row flex-wrap gap-2'>
      {options.map((option) => {
        const isSelected = value.includes(option.value);
        return (
          <Pressable
            key={option.value}
            onPress={() => toggle(option.value)}
            hitSlop={6}
            className={cn(
              'min-h-[44px] justify-center rounded-full border px-4 py-2',
              isSelected ? 'border-emerald-600 bg-emerald-600' : 'border-border bg-background'
            )}
          >
            <Text
              className={cn(
                'text-sm font-semibold',
                isSelected ? 'text-white' : 'text-foreground'
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
