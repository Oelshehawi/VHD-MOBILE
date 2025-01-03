import { Text, Pressable } from 'react-native';

interface ButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  className?: string;
}

export function Button({
  onPress,
  children,
  variant = 'primary',
  className = '',
}: ButtonProps) {
  const baseStyles =
    'px-4 py-2 rounded-md flex-row items-center justify-center';
  const variantStyles = {
    primary: 'bg-cyan-600 active:bg-cyan-700',
    secondary:
      'bg-gray-200 active:bg-gray-300 dark:bg-gray-700 dark:active:bg-gray-600',
    outline: 'border border-gray-300 dark:border-gray-600',
  };

  const textStyles = {
    primary: 'text-white font-medium',
    secondary: 'text-gray-900 dark:text-white font-medium',
    outline: 'text-gray-900 dark:text-white font-medium',
  };

  return (
    <Pressable
      onPress={onPress}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
    >
      <Text className={textStyles[variant]}>{children}</Text>
    </Pressable>
  );
}
