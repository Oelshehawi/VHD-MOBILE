const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBackgroundActionsService(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    // Ensure the application element exists
    if (!manifest.application || !Array.isArray(manifest.application)) {
      console.warn('Warning: Could not find application element in AndroidManifest.xml');
      return config;
    }

    const app = manifest.application[0];

    // Ensure the service array exists
    if (!app.service) {
      app.service = [];
    }

    // Check if the service already exists
    const serviceExists = app.service.some(
      (service) => service.$['android:name'] === 'com.asterinet.react.bgactions.RNBackgroundActionsTask'
    );

    // Add the service if it doesn't exist
    if (!serviceExists) {
      app.service.push({
        $: {
          'android:name': 'com.asterinet.react.bgactions.RNBackgroundActionsTask',
          'android:foregroundServiceType': 'dataSync',
        },
      });
    }

    return config;
  });
};
