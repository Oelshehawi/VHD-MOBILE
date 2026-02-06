import { FlatList, TouchableOpacity } from 'react-native';
import { Text } from '../ui/text';

interface LogCategoryFilterProps {
  categories: string[];
  selectedCategory: string;
  onSelect: (category: string) => void;
}

export function LogCategoryFilter({
  categories,
  selectedCategory,
  onSelect
}: LogCategoryFilterProps) {
  return (
    <FlatList
      horizontal
      data={categories}
      keyExtractor={(item) => item}
      showsHorizontalScrollIndicator={false}
      className='mb-2 h-8'
      style={{ height: 32 }}
      contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => onSelect(item)}
          className={`px-3 py-0.5 rounded-full ${
            selectedCategory === item ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          <Text
            className={
              selectedCategory === item
                ? 'text-white font-medium'
                : 'text-gray-700 dark:text-gray-300'
            }
          >
            {item}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}
