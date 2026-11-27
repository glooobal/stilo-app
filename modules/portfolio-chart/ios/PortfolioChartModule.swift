import ExpoModulesCore
import SwiftUI

/// A label on the X axis: the index of the point it belongs to and its text.
struct ChartAxisLabelRecord: Record {
  @Field var index: Int = 0
  @Field var text: String = ""
}

/// An extra solid line (e.g. a benchmark), one value per point, and its color as `#RRGGBB`.
struct ChartSeriesRecord: Record {
  @Field var values: [Double] = []
  @Field var color: String = "#8E8E93"
}

/// A dot on the main line at a point (e.g. a trade), in `#RRGGBB`.
struct ChartMarkerRecord: Record {
  @Field var index: Int = 0
  @Field var color: String = "#8E8E93"
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

      Prop("extraSeries") { (view: PortfolioChartView, series: [ChartSeriesRecord]?) in
        view.model.extraSeries = (series ?? []).map {
          ChartExtraSeries(values: $0.values, color: Color(hex: $0.color))
        }
      }

      Prop("markers") { (view: PortfolioChartView, markers: [ChartMarkerRecord]?) in
        view.model.markers = (markers ?? []).map {
          ChartMarker(index: $0.index, color: Color(hex: $0.color))
        }
      }

      Prop("valueFormat") { (view: PortfolioChartView, format: String?) in
        view.model.isPercent = format == "percent"
      }

      Prop("showsArea") { (view: PortfolioChartView, showsArea: Bool?) in
        view.model.showsArea = showsArea ?? true
      }

      Prop("compact") { (view: PortfolioChartView, compact: Bool?) in
        view.setCompact(compact ?? false)
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
