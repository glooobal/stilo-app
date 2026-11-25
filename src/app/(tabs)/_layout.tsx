import { NativeTabs } from 'expo-router/native-tabs';
import { Platform } from 'react-native';

export default function TabsLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="(summary)">
        <NativeTabs.Trigger.Label>Podsumowanie</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'chart.bar.xaxis', selected: 'chart.bar.xaxis' }}
          md={{ default: 'bar_chart', selected: 'bar_chart' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="wallets">
        <NativeTabs.Trigger.Label>Portfele</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'wallet.bifold', selected: 'wallet.bifold.fill' }}
          md={{ default: 'account_balance_wallet', selected: 'account_balance_wallet' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="dividends">
        <NativeTabs.Trigger.Label>Dywidendy</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'calendar', selected: 'calendar' }}
          md={{ default: 'calendar_month', selected: 'calendar_month' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search" role={Platform.OS === 'ios' ? 'search' : undefined}>
        <NativeTabs.Trigger.Label>Szukaj</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
