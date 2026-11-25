import { Stack } from 'expo-router';

import { Colors } from '@/constants/colors';

export default function TransactionLayout() {
  return <Stack screenOptions={{ contentStyle: { backgroundColor: Colors.background } }} />;
}
