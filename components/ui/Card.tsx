import { View } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <View
      className={`bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm mb-4 ${className}`}
    >
      {children}
    </View>
  );
}
