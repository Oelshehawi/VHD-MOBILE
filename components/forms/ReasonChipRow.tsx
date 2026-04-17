import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface ChipOption<T extends string | number> {
  value: T;
  label: string;
}

interface ReasonChipRowProps<T extends string | number> {
  options: ReadonlyArray<ChipOption<T>>;
  value: T | undefined | '';
  onChange: (next: T) => void;
}

export function ReasonChipRow<T extends string | number>({
  options,
  value,
  onChange
}: ReasonChipRowProps<T>) {
  return (
    <View className='flex-row flex-wrap gap-2'>
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
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
