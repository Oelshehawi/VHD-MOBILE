Pod::Spec.new do |s|
  s.name = 'VHDTrackingStatus'
  s.version = '1.0.0'
  s.summary = 'Read native tracking readiness settings'
  s.description = 'Read-only location precision and background recovery diagnostics.'
  s.license = { :type => 'MIT' }
  s.author = 'VHD'
  s.homepage = 'https://app.vancouverhooddoctors.ca'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
