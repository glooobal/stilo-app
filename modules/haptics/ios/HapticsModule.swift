import ExpoModulesCore
import UIKit

/// Short system haptics: `success` (e.g. a goal reached), `selection` and `impact`.
public class HapticsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Haptics")

    Function("notify") { (kind: String) in
      DispatchQueue.main.async {
        switch kind {
        case "selection":
          UISelectionFeedbackGenerator().selectionChanged()
        case "impact":
          UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "warning":
          UINotificationFeedbackGenerator().notificationOccurred(.warning)
        default:
          UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
      }
    }
  }
}
