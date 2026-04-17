import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface NumberStepperProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
}

export function NumberStepper({ label, value, onChange, min = 0 }: NumberStepperProps) {
  const safeValue = Number.isFinite(value) ? value : min;

  const decrement = () => {
    const next = Math.max(min, safeValue - 1);
    onChange(next);
  };

  const increment = () => {
    onChange(safeValue + 1);
  };

  return (
    <View className='flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3'>
      <Text className='flex-1 text-base font-semibold text-foreground'>{label}</Text>
      <View className='flex-row items-center gap-3'>
        <Pressable
          onPress={decrement}
          hitSlop={8}
          className={cn(
            'h-11 w-11 items-center justify-center rounded-full border border-border bg-background',
            safeValue <= min && 'opacity-40'
          )}
          disabled={safeValue <= min}
        >
          <Text className='text-xl font-bold text-foreground'>{'\u2212'}</Text>
        </Pressable>
        <View className='min-w-[36px] items-center'>
          <Text className='text-lg font-semibold text-foreground'>{safeValue}</Text>
        </View>
        <Pressable
          onPress={increment}
          hitSlop={8}
          className='h-11 w-11 items-center justify-center rounded-full border border-emerald-600 bg-emerald-600'
        >
          <Text className='text-xl font-bold text-white'>+</Text>
        </Pressable>
      </View>
    </View>
  );
}
