package expo.modules.vhdtrackingstatus

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VHDTrackingStatusModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VHDTrackingStatus")
    AsyncFunction("getStatus") {
      val context = appContext.reactContext ?: throw IllegalStateException("Context unavailable")
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val activity = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      mapOf(
        "accuracyAuthorization" to "unknown",
        "backgroundRefresh" to "unknown",
        "batteryRestricted" to ((Build.VERSION.SDK_INT >= 28 && activity.isBackgroundRestricted) ||
          !power.isIgnoringBatteryOptimizations(context.packageName)),
        "lowPowerMode" to power.isPowerSaveMode
      )
    }
  }
}
