Pod::Spec.new do |s|
  s.name           = 'CrmMac'
  s.version        = '1.0.0'
  s.summary        = 'isiOSAppOnMac for Bissabi CRM Pro'
  s.homepage       = 'https://github.com/mohamadalhabib92/bissabi-crm-pro'
  s.license        = 'MIT'
  s.author         = 'Bissabi'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
end
