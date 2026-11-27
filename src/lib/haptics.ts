import { requireOptionalNativeModule } from 'expo';

type HapticsModule = { notify(kind: string): void };

/** Local module `modules/haptics`; missing until the app is rebuilt (then nothing happens). */
const native = requireOptionalNativeModule<HapticsModule>('Haptics');

/** A short system haptic, e.g. `success` after creating a portfolio. */
export function haptic(kind: 'success' | 'selection' | 'impact' | 'warning' = 'success') {
  try {
    native?.notify(kind);
  } catch {
    // Haptics are a nicety; never fail an action over them.
  }
}
