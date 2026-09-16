import ExpoModulesCore
import CoreLocation
import UIKit

public class VHDTrackingStatusModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VHDTrackingStatus")
    AsyncFunction("getStatus") { () -> [String: Any] in
      let manager = CLLocationManager()
      let refresh: String
      switch UIApplication.shared.backgroundRefreshStatus {
      case .available: refresh = "available"
      case .denied: refresh = "denied"
      case .restricted: refresh = "restricted"
      @unknown default: refresh = "unknown"
      }
      return [
        "accuracyAuthorization": manager.accuracyAuthorization == .fullAccuracy ? "full" : "reduced",
        "backgroundRefresh": refresh,
        "batteryRestricted": NSNull(),
        "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled
      ]
    }.runOnQueue(.main)
  }
}
