Pod::Spec.new do |s|
  s.name             = 'PortfolioChart'
  s.version          = '1.0.0'
  s.summary          = 'Swift Charts line chart for 12payouts'
  s.description      = 'Portfolio line chart with a gradient fill, axes and press-and-hold value preview.'
  s.license          = 'MIT'
  s.author           = '12payouts'
  s.homepage         = 'https://github.com/'
  s.platforms        = { :ios => '16.4' }
  s.swift_version    = '5.9'
  s.source           = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
