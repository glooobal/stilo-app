import ExpoModulesCore
import SwiftUI
import UIKit

/// Native view hosting the SwiftUI chart.
///
/// Touch handling lives here in UIKit, not in SwiftUI: a SwiftUI gesture on the
/// chart swallowed horizontal swipes, so the chart pager could only be swiped
/// above the chart. A UIKit long press recognizer runs simultaneously with the
/// surrounding scroll views: a swipe scrolls them, press-and-hold starts the
/// value preview (and only then pauses scrolling).
final class PortfolioChartView: ExpoView, UIGestureRecognizerDelegate {
  let model = PortfolioChartModel()
  /// `{ index }` of the point under the finger, or `-1` when the finger lifts.
  let onScrub = EventDispatcher()

  private var hostingController: UIHostingController<PortfolioChartContent>?
  private let selectionFeedback = UISelectionFeedbackGenerator()
  private var lockedScrollViews: [UIScrollView] = []

  private lazy var scrubRecognizer: UILongPressGestureRecognizer = {
    let recognizer = UILongPressGestureRecognizer(target: self, action: #selector(handleScrub(_:)))
    recognizer.minimumPressDuration = 0.3
    // Moving further before the press is recognized means a swipe, not a preview.
    recognizer.allowableMovement = 10
    recognizer.delegate = self
    return recognizer
  }()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false

    let content = PortfolioChartContent(model: model) { [weak self] index, isGesture in
      self?.handleSelection(index, isGesture: isGesture)
    }
    let controller = UIHostingController(rootView: content)
    controller.view.backgroundColor = .clear
    // Touches go to this view's recognizer and the scroll views around it;
    // the chart is only drawn (VoiceOver still reaches it).
    controller.view.isUserInteractionEnabled = false
    if #available(iOS 16.4, *) {
      controller.safeAreaRegions = []
    }
    addSubview(controller.view)
    hostingController = controller
    addGestureRecognizer(scrubRecognizer)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    // Safety net: never leave the screen unscrollable if the view goes away mid-gesture.
    if window == nil {
      endScrub()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    hostingController?.view.frame = bounds
  }

  // MARK: - Scrubbing

  @objc private func handleScrub(_ recognizer: UILongPressGestureRecognizer) {
    switch recognizer.state {
    case .began:
      lockScrollViews()
      selectionFeedback.prepare()
      model.scrubX = recognizer.location(in: self).x
    case .changed:
      model.scrubX = recognizer.location(in: self).x
    default:
      endScrub()
    }
  }

  private func endScrub() {
    model.scrubX = nil
    unlockScrollViews()
  }

  /// Let the scroll views (chart pager, screen) recognize their pans at the same time.
  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    true
  }

  private func handleSelection(_ index: Int?, isGesture: Bool) {
    guard let index else {
      onScrub(["index": -1])
      return
    }
    // A finger gets haptic ticks; VoiceOver reads each point instead.
    if isGesture {
      selectionFeedback.selectionChanged()
      selectionFeedback.prepare()
    }
    onScrub(["index": index])
  }

  /// While previewing values, neither the chart pager nor the screen may scroll.
  private func lockScrollViews() {
    guard lockedScrollViews.isEmpty else { return }
    var view = superview
    while let current = view {
      if let scrollView = current as? UIScrollView, scrollView.isScrollEnabled {
        // Stops a pan that already started together with the press.
        scrollView.panGestureRecognizer.isEnabled = false
        scrollView.panGestureRecognizer.isEnabled = true
        scrollView.isScrollEnabled = false
        lockedScrollViews.append(scrollView)
      }
      view = current.superview
    }
  }

  private func unlockScrollViews() {
    for scrollView in lockedScrollViews {
      scrollView.isScrollEnabled = true
    }
    lockedScrollViews.removeAll()
  }
}
