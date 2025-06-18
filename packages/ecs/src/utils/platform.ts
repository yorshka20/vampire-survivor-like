export function isMobileDevice(): boolean {
  // Check if the device has touch event
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Check if the user agent is mobile
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

  // Check if the screen is small
  const isSmallScreen = window.innerWidth <= 768;

  return hasTouch && (isMobile || isSmallScreen);
}
