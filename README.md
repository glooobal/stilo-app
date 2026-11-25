# 12payouts

Aplikacja iOS do śledzenia portfela inwestycyjnego i dywidend (Expo SDK 58, Expo Router, natywne zakładki z Liquid Glass).

## Uruchomienie

```bash
npm install
npx expo run:ios      # development build
npx expo start        # serwer deweloperski
```

## Struktura

- `src/app/` – trasy Expo Router; każda zakładka ma własny folder z natywnym `Stack` (duży tytuł, przyciski i wyszukiwarka w nagłówku).
- `src/components/` – komponenty współdzielone.
- `src/constants/` – stałe (kolory systemowe).

Katalogi `ios/` i `android/` są generowane (`npx expo prebuild`) i nie są w repozytorium.
