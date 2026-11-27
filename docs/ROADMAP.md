# Roadmap – ustalenia do zrobienia później

## Onboarding (uzgodnione 26.11.2026, zrobione 27.11.2026)

Pokazywany **tylko przy pierwszym uruchomieniu aplikacji**. Każdy krok można pominąć.

1. Krótkie powitanie: co aplikacja robi.
2. Pierwszy portfel: nazwa, typ konta (zwykły / IKE / IKZE), waluta.
3. Pytanie „Chcesz ustawić cel dywidendowy?” → jeśli tak: kwota **miesięczna netto**
   lub roczna (min. 1 zł), od razu na tym kroku. Postęp liczony z dywidend netto otrzymanych
   w ostatnich 12 miesiącach; karta „Cel dywidendowy” na górze zakładki Dywidendy, po
   osiągnięciu konfetti i „Ustaw kolejny cel”. Powiadomienia lokalne (expo-notifications):
   wypłata dywidendy w szacowanym dniu i osiągnięcie celu; przełącznik w Ustawieniach.

Szczegóły (wygląd, teksty) do uzgodnienia przed implementacją.

## Nazwa

Aplikacja nazywa się **Stilo** (getstilo.app), identyfikator pakietu `com.zaza.stilo` (iOS i
Android), schemat URL `stilo`. Plik bazy danych zostaje `12payouts.db`, a kopie
zapasowe w starym formacie (`12payouts-backup`) nadal są czytane.
