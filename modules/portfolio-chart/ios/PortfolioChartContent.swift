import Charts
import SwiftUI

struct ChartAxisLabel: Hashable {
  let index: Double
  let text: String
}

final class PortfolioChartModel: ObservableObject {
  @Published var values: [Double] = []
  /// Optional second line, one value per point (e.g. invested capital), drawn dashed.
  @Published var secondaryValues: [Double] = []
  @Published var baseline: Double?
  @Published var color: Color = .blue
  @Published var xLabels: [ChartAxisLabel] = []
  /// Spoken name of the chart, e.g. "Wartość portfela".
  @Published var accessibilityTitle: String = ""
  /// Spoken description of every point, e.g. "24 lis 2026: 12 345,67 zł".
  @Published var pointLabels: [String] = []
  /// X position of the finger while previewing values (set by the UIKit view), `nil` otherwise.
  @Published var scrubX: CGFloat?
}

/// Line with a fading gradient below it, dates on the X axis, values on the
/// right, a dashed line at the start value and an optional dashed second
/// line (invested capital). Press and hold, then drag, to
/// preview the value under the finger (like the Stocks app). The touch itself
/// is recognized by `PortfolioChartView` (UIKit) and arrives as `model.scrubX`.
///
/// VoiceOver: the chart is one element; swiping up/down moves through the
/// points (the same preview as dragging a finger) and reads each of them.
struct PortfolioChartContent: View {
  @ObservedObject var model: PortfolioChartModel
  /// Index under the finger (or VoiceOver cursor), `nil` when released.
  /// `isGesture` is false for VoiceOver, which must not lock scrolling.
  let onSelectionChange: @MainActor (_ index: Int?, _ isGesture: Bool) -> Void

  @State private var selectedIndex: Int?
  @AccessibilityFocusState private var isAccessibilityFocused: Bool

  private static let axisLocale = Locale(identifier: "pl_PL")

  private var hasData: Bool {
    model.values.count >= 2
  }

  /// Values to draw; without data, a flat line at zero.
  private var plottedValues: [Double] {
    hasData ? model.values : [0, 0]
  }

  /// The second line, only when it has a value for every point.
  private var secondaryValues: [Double] {
    hasData && model.secondaryValues.count == model.values.count ? model.secondaryValues : []
  }

  private var yDomain: ClosedRange<Double> {
    let values = plottedValues
    var low = values.min() ?? 0
    var high = values.max() ?? 0
    if let secondaryLow = secondaryValues.min(), let secondaryHigh = secondaryValues.max() {
      low = min(low, secondaryLow)
      high = max(high, secondaryHigh)
    }
    if hasData, let baseline = model.baseline {
      low = min(low, baseline)
      high = max(high, baseline)
    }
    let span = high - low
    if span <= .ulpOfOne {
      // Flat line: zero sits at the bottom, any other value in the middle.
      if low == 0 {
        return 0...1
      }
      let padding = abs(low) * 0.05
      return (low - padding)...(high + padding)
    }
    let padding = span * 0.12
    return (low - padding)...(high + padding)
  }

  var body: some View {
    let values = plottedValues
    let domain = yDomain

    Chart {
      marks(values: values, domain: domain, color: model.color)
    }
    .chartXScale(domain: 0...Double(max(values.count - 1, 1)))
    .chartYScale(domain: domain)
    .chartXAxis {
      AxisMarks(values: model.xLabels.map(\.index)) { value in
        AxisValueLabel {
          Text(xLabelText(for: value))
        }
      }
    }
    .chartYAxis {
      AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { value in
        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5))
        AxisValueLabel {
          Text(Self.formatAxisValue(value.as(Double.self) ?? 0))
        }
      }
    }
    .chartOverlay { proxy in
      // Maps the finger position (from UIKit) to a point; draws nothing.
      GeometryReader { geometry in
        Color.clear
          .allowsHitTesting(false)
          .onChange(of: model.scrubX) { x in
            if let x {
              select(atX: x, proxy: proxy, geometry: geometry, count: values.count)
            } else {
              endScrubbing()
            }
          }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(model.accessibilityTitle)
    .accessibilityValue(accessibilityValueText)
    .accessibilityHint(hasData ? "Przesuń w górę lub w dół, aby przejść po punktach wykresu." : "")
    .accessibilityAdjustableAction { direction in
      moveAccessibilitySelection(direction)
    }
    .accessibilityFocused($isAccessibilityFocused)
    .onChange(of: isAccessibilityFocused) { isFocused in
      // Leaving the chart with VoiceOver ends the preview, like lifting the finger.
      if !isFocused, selectedIndex != nil {
        selectedIndex = nil
        onSelectionChange(nil, false)
      }
    }
  }

  /// The selected point, or the latest one, as spoken text.
  private var accessibilityValueText: String {
    guard hasData else { return "Brak danych" }
    let labels = model.pointLabels
    guard !labels.isEmpty else { return "" }
    let index = min(selectedIndex ?? labels.count - 1, labels.count - 1)
    return labels[index]
  }

  private func moveAccessibilitySelection(_ direction: AccessibilityAdjustmentDirection) {
    guard hasData else { return }
    let count = model.values.count
    let current = selectedIndex ?? count - 1
    let next: Int
    switch direction {
    case .increment:
      next = min(current + 1, count - 1)
    case .decrement:
      next = max(current - 1, 0)
    @unknown default:
      return
    }
    selectedIndex = next
    onSelectionChange(next, false)
  }

  @ChartContentBuilder
  private func marks(values: [Double], domain: ClosedRange<Double>, color: Color) -> some ChartContent {
    ForEach(values.indices, id: \.self) { index in
      AreaMark(
        x: .value("Punkt", Double(index)),
        yStart: .value("Dół", domain.lowerBound),
        yEnd: .value("Wartość", values[index])
      )
      .foregroundStyle(areaGradient(color: color))
    }

    // Under the main line, so the value stays on top where they cross.
    ForEach(secondaryValues.indices, id: \.self) { index in
      LineMark(
        x: .value("Punkt", Double(index)),
        y: .value("Kapitał", secondaryValues[index]),
        series: .value("Seria", "Kapitał")
      )
      .foregroundStyle(Color.secondary.opacity(0.8))
      .lineStyle(StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round, dash: [4, 3]))
    }

    ForEach(values.indices, id: \.self) { index in
      LineMark(
        x: .value("Punkt", Double(index)),
        y: .value("Wartość", values[index]),
        series: .value("Seria", "Wartość")
      )
      .foregroundStyle(color)
      .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
    }

    if hasData, let baseline = model.baseline {
      RuleMark(y: .value("Początek okresu", baseline))
        .foregroundStyle(Color.secondary.opacity(0.7))
        .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
    }

    if let selectedIndex, selectedIndex < values.count {
      RuleMark(x: .value("Punkt", Double(selectedIndex)))
        .foregroundStyle(Color.secondary.opacity(0.6))
        .lineStyle(StrokeStyle(lineWidth: 1))

      PointMark(
        x: .value("Punkt", Double(selectedIndex)),
        y: .value("Wartość", values[selectedIndex])
      )
      .foregroundStyle(color)
      .symbolSize(80)
    }
  }

  private func areaGradient(color: Color) -> LinearGradient {
    LinearGradient(
      colors: [color.opacity(hasData ? 0.28 : 0), color.opacity(0)],
      startPoint: .top,
      endPoint: .bottom
    )
  }

  private func xLabelText(for value: AxisValue) -> String {
    guard let index = value.as(Double.self) else { return "" }
    return model.xLabels.first(where: { $0.index == index })?.text ?? ""
  }

  private func endScrubbing() {
    guard selectedIndex != nil else { return }
    selectedIndex = nil
    onSelectionChange(nil, true)
  }

  private func select(atX x: CGFloat, proxy: ChartProxy, geometry: GeometryProxy, count: Int) {
    guard hasData else { return }
    let plotFrame: CGRect
    if #available(iOS 17.0, *), let anchor = proxy.plotFrame {
      plotFrame = geometry[anchor]
    } else {
      plotFrame = geometry[proxy.plotAreaFrame]
    }
    guard let position: Double = proxy.value(atX: x - plotFrame.origin.x) else { return }
    let index = min(max(Int(position.rounded()), 0), count - 1)
    guard index != selectedIndex else { return }
    selectedIndex = index
    onSelectionChange(index, true)
  }

  /// Short axis value in Polish, e.g. `12,3 tys.` or `1,5 mln`.
  private static func formatAxisValue(_ value: Double) -> String {
    value.formatted(
      .number
        .notation(.compactName)
        .precision(.fractionLength(0...1))
        .locale(axisLocale)
    )
  }
}
