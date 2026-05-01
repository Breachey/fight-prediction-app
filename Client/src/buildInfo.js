export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
export const APP_BUILD_SHA = typeof __APP_BUILD_SHA__ !== 'undefined' ? __APP_BUILD_SHA__ : '';

export const APP_VERSION_LABEL = APP_BUILD_SHA
  ? `Version ${APP_VERSION} (${APP_BUILD_SHA})`
  : `Version ${APP_VERSION}`;
