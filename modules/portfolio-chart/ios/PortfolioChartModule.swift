import ExpoModulesCore
import SwiftUI

/// A label on the X axis: the index of the point it belongs to and its text.
struct ChartAxisLabelRecord: Record {
  @Field var index: Int = 0
  @Field var text: String = ""
}

public class PortfolioChartModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PortfolioChart")

    View(PortfolioChartView.self) {
      Events("onScrub")

      Prop("values") { (view: PortfolioChartView, values: [Double]?) in
        view.model.values = values ?? []
      }

      Prop("secondaryValues") { (view: PortfolioChartView, values: [Double]?) in
        view.model.secondaryValues = values ?? []
      }

      Prop("baseline") { (view: PortfolioChartView, baseline: Double?) in
        view.model.baseline = baseline
      }

      Prop("color") { (view: PortfolioChartView, color: UIColor?) in
        view.model.color = Color(uiColor: color ?? .systemBlue)
      }

      Prop("accessibilityTitle") { (view: PortfolioChartView, title: String?) in
        view.model.accessibilityTitle = title ?? ""
      }

      Prop("pointLabels") { (view: PortfolioChartView, labels: [String]?) in
        view.model.pointLabels = labels ?? []
      }

      Prop("xLabels") { (view: PortfolioChartView, labels: [ChartAxisLabelRecord]?) in
        view.model.xLabels = (labels ?? []).map {
          ChartAxisLabel(index: Double($0.index), text: $0.text)
        }
      }
    }
  }
}
