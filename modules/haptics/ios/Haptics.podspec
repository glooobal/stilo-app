Pod::Spec.new do |s|
  s.name             = 'Haptics'
  s.version          = '1.0.0'
  s.summary          = 'Haptic feedback for Stilo'
  s.description      = 'Short system haptics (success, selection, impact) without an extra package.'
  s.license          = 'MIT'
  s.author           = 'Stilo'
  s.homepage         = 'https://getstilo.app'
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
