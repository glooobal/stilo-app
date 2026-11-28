import { Host, Picker, Switch } from '@expo/ui';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/confetti';
import { GoalEditor, parseGoalAmount } from '@/components/goal-editor';
import { LogoBubbles } from '@/components/logo-bubbles';
import { Colors } from '@/constants/colors';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  createPortfolio,
  DEFAULT_PORTFOLIO_ICON,
  PORTFOLIO_CURRENCIES,
  type AccountType,
} from '@/db/portfolios';
import { setDividendGoal, type GoalPeriod } from '@/lib/dividend-goal';
import { haptic } from '@/lib/haptics';
import { setDividendNotifications } from '@/lib/notifications';
import { track } from '@/lib/analytics';
import { markOnboardingDone } from '@/lib/onboarding';
import { getSummaryCurrency } from '@/lib/settings';

type Step = 'welcome' | 'portfolio' | 'goal';

const MAX_NAME_LENGTH = 40;
const CASH_INFO =
  'Portfel gotówkowy śledzi gotówkę na koncie. Będziesz musiał dodawać wpłaty oraz wypłaty, a operacje będą zmieniać saldo dostępnej gotówki (zakupy je zmniejszają, sprzedaże i dywidendy zwiększają). Wartość portfela będzie liczona jako pozycje plus aktualna gotówka.\n\nTego nie da się zmienić po utworzeniu portfela.';
const DIVIDENDS_INFO =
  'Włącz (domyślnie), jeśli chcesz, żeby otrzymane dywidendy liczyły się w wynikach pojedynczych pozycji w portfelu.\n\nWyłącz, jeśli chcesz, żeby w wynikach pozycji pokazywał się sam zysk z ceny i/lub kursu waluty (tak jak u Twojego brokera lub w domu maklerskim).';
/** How long the confetti plays before the next step. */
const CELEBRATION_MS = 1100;

function showInfo(title: string, message: string) {
  Alert.alert(title, message, [{ text: 'Rozumiem', style: 'default', isPreferred: true }]);
}

/** Name of an option with ⓘ; tapping it shows the explanation. */
function InfoLabel({ label, message }: { label: string; message: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Pokazuje wyjaśnienie"
      onPress={() => showInfo(label, message)}
      style={({ pressed }) => [styles.infoLabel, pressed && styles.pressed]}>
      <Text style={[styles.rowLabel, styles.shrink]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {label}
      </Text>
      <SymbolView name="info.circle" size={17} tintColor={Colors.tint} />
    </Pressable>
  );
}

/** Big filled button at the bottom, like in Apple's own onboarding. */
function PrimaryButton({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Text style={styles.primaryText}>{title}</Text>
    </Pressable>
  );
}

function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
      <Text style={styles.secondaryText}>{title}</Text>
    </Pressable>
  );
}

/**
 * First launch: a welcome, the first portfolio and an optional monthly
 * dividend goal. Every step can be skipped to look around first.
 */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('welcome');

  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('standard');
  const [currency, setCurrency] = useState('PLN');
  const [isCash, setIsCash] = useState(false);
  const [includeDividends, setIncludeDividends] = useState(true);

  const [goalText, setGoalText] = useState('');
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>('month');
  const [goalCurrency, setGoalCurrency] = useState(getSummaryCurrency);
  const goalAmount = parseGoalAmount(goalText);

  // Confetti and a short haptic after creating something.
  const [confettiKey, setConfettiKey] = useState(0);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const celebrate = (then: () => void) => {
    setIsCelebrating(true);
    setConfettiKey((key) => key + 1);
    haptic('success');
    setTimeout(() => {
      setIsCelebrating(false);
      then();
    }, CELEBRATION_MS);
  };

  const [createdPortfolio, setCreatedPortfolio] = useState(false);
  const finish = (setGoal = false) => {
    track({
      name: 'onboarding_complete',
      params: { created_portfolio: createdPortfolio, set_goal: setGoal },
    });
    markOnboardingDone();
    router.back();
    // Asked once, at the end: reminders of payments and of the goal.
    setDividendNotifications(true);
  };

  const createFirstPortfolio = () => {
    if (!name.trim()) return;
    createPortfolio({
      name,
      baseCurrency: currency,
      accountType,
      icon: DEFAULT_PORTFOLIO_ICON,
      includeDividends,
      isCash,
    });
    track({ name: 'portfolio_create', params: { account_type: accountType, is_cash: isCash } });
    setCreatedPortfolio(true);
    celebrate(() => setStep('goal'));
  };

  const saveGoal = () => {
    if (goalAmount == null) return;
    try {
      setDividendGoal({ amount: goalAmount, period: goalPeriod, currency: goalCurrency });
    } catch (error) {
      Alert.alert(
        'Nie udało się zapisać celu',
        error instanceof Error ? error.message : 'Spróbuj ponownie.'
      );
      return;
    }
    track({ name: 'dividend_goal_set', params: { period: goalPeriod } });
    celebrate(() => finish(true));
  };

  const footer = (children: ReactNode) => (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      {step === 'welcome' ? (
        <Animated.View key="welcome" exiting={FadeOut.duration(200)} style={styles.screen}>
          <View style={{ paddingTop: insets.top + 24 }}>
            <LogoBubbles height={360} />
          </View>
          <Animated.View entering={FadeInDown.delay(500).duration(500)} style={styles.welcomeText}>
            <Text style={styles.largeTitle}>Witaj w Stilo</Text>
            <Text style={styles.body}>
              Jedynej aplikacji, której potrzebujesz do śledzenia swoich inwestycji.
            </Text>
          </Animated.View>
          {footer(<PrimaryButton title="Przejdź dalej" onPress={() => setStep('portfolio')} />)}
        </Animated.View>
      ) : null}

      {step === 'portfolio' ? (
        <Animated.View
          key="portfolio"
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
          style={styles.screen}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.content, { paddingTop: insets.top + 48 }]}>
            <View style={styles.symbol}>
              <SymbolView name="wallet.bifold.fill" size={34} tintColor={Colors.tint} />
            </View>
            <Text style={styles.title}>Twój pierwszy portfel</Text>
            <Text style={[styles.body, styles.center]}>
              Na przykład konto maklerskie albo IKE. Kolejne portfele dodasz później.
            </Text>

            <View style={styles.group}>
              <TextInput
                value={name}
                onChangeText={(text) => setName(text.slice(0, MAX_NAME_LENGTH))}
                placeholder="Nazwa, np. XTB"
                placeholderTextColor={Colors.tertiaryLabel}
                returnKeyType="done"
                autoFocus={false}
                style={[styles.row, styles.input]}
              />
              <View style={styles.separator} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Rodzaj konta</Text>
                <Host matchContents>
                  <Picker
                    selectedValue={accountType}
                    onValueChange={(value) => setAccountType(value as AccountType)}
                    appearance="menu"
                    accessibilityLabel="Rodzaj konta">
                    {ACCOUNT_TYPES.map((type) => (
                      <Picker.Item key={type} label={ACCOUNT_TYPE_LABELS[type]} value={type} />
                    ))}
                  </Picker>
                </Host>
              </View>
              <View style={styles.separator} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Waluta</Text>
                <Host matchContents>
                  <Picker
                    selectedValue={currency}
                    onValueChange={(value) => setCurrency(String(value))}
                    appearance="menu"
                    accessibilityLabel="Waluta">
                    {PORTFOLIO_CURRENCIES.map((code) => (
                      <Picker.Item key={code} label={code} value={code} />
                    ))}
                  </Picker>
                </Host>
              </View>
              <View style={styles.separator} />
              <View style={styles.row}>
                <InfoLabel label="Portfel gotówkowy" message={CASH_INFO} />
                <Host matchContents>
                  <Switch value={isCash} onValueChange={setIsCash} />
                </Host>
              </View>
              <View style={styles.separator} />
              <View style={styles.row}>
                <InfoLabel label="Wliczaj dywidendy do wyniku" message={DIVIDENDS_INFO} />
                <Host matchContents>
                  <Switch value={includeDividends} onValueChange={setIncludeDividends} />
                </Host>
              </View>
            </View>
          </ScrollView>
          {footer(
            <>
              <PrimaryButton
                title="Utwórz portfel"
                disabled={!name.trim() || isCelebrating}
                onPress={createFirstPortfolio}
              />
              <SecondaryButton title="Pomiń i zobacz aplikację" onPress={() => finish()} />
            </>
          )}
        </Animated.View>
      ) : null}

      {step === 'goal' ? (
        <Animated.View key="goal" entering={FadeIn.duration(300)} style={styles.screen}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.content, { paddingTop: insets.top + 48 }]}>
            <View style={styles.symbol}>
              <SymbolView name="target" size={34} tintColor={Colors.tint} />
            </View>
            <Text style={styles.title}>Ustaw cel dywidendowy</Text>
            <Text style={[styles.body, styles.center]}>
              Śledź swoje dywidendy w Stilo i zobacz, jak blisko FIRE już jesteś.
            </Text>
            <View style={styles.goalEditor}>
              <GoalEditor
                amountText={goalText}
                onAmountTextChange={setGoalText}
                period={goalPeriod}
                onPeriodChange={setGoalPeriod}
                currency={goalCurrency}
                onCurrencyChange={setGoalCurrency}
              />
            </View>
          </ScrollView>
          {footer(
            <>
              <PrimaryButton
                title="Ustaw cel"
                disabled={goalAmount == null || isCelebrating}
                onPress={saveGoal}
              />
              <SecondaryButton title="Nie teraz, przejdź do aplikacji" onPress={() => finish()} />
            </>
          )}
        </Animated.View>
      ) : null}

      {confettiKey > 0 ? <Confetti key={confettiKey} /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  welcomeText: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'stretch',
  },
  symbol: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.fill,
    marginBottom: 20,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: Colors.label,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.label,
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 17,
    lineHeight: 23,
    color: Colors.secondaryLabel,
    textAlign: 'center',
  },
  center: {
    textAlign: 'center',
  },
  group: {
    marginTop: 32,
    borderRadius: 26,
    borderCurve: 'continuous',
    backgroundColor: Colors.groupedBackground,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 12,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
    backgroundColor: Colors.separator,
  },
  rowLabel: {
    fontSize: 17,
    color: Colors.label,
  },
  input: {
    fontSize: 17,
    color: Colors.label,
  },
  goalEditor: {
    marginTop: 40,
  },
  infoLabel: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shrink: {
    flexShrink: 1,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 14,
    alignItems: 'stretch',
  },
  primary: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  disabled: {
    opacity: 0.4,
  },
  secondary: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  secondaryText: {
    fontSize: 17,
    color: Colors.tint,
  },
  pressed: {
    opacity: 0.6,
  },
});
