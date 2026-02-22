import { useEffect } from 'react';

function useViewportInsets() {
  useEffect(() => {
    const root = document.documentElement;
    let rafId = 0;
    const isAndroid = /Android/i.test(window.navigator.userAgent || '');

    const setInsets = () => {
      let bottomOffset = 0;
      if (window.visualViewport) {
        const vv = window.visualViewport;
        bottomOffset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      }
      // Ignore browser toolbar oscillations; keep offset only for large shifts (e.g. keyboard open).
      const stableBottomOffset = bottomOffset >= 56 ? Math.round(bottomOffset) : 0;
      root.style.setProperty('--vv-bottom', `${stableBottomOffset}px`);

      let androidExtra = 0;
      if (isAndroid && stableBottomOffset === 0) {
        const screenHeight = Number(window.screen?.height || 0);
        const availHeight = Number(window.screen?.availHeight || 0);
        const fallbackInset = Math.max(0, screenHeight - availHeight);
        // Ignore tiny screen/avail deltas that cause 1-5px nav "floating".
        androidExtra = fallbackInset >= 24 ? Math.min(48, Math.round(fallbackInset)) : 0;
      }
      root.style.setProperty('--android-nav-extra', `${androidExtra}px`);
      root.classList.toggle('android-virtual-nav-active', isAndroid && androidExtra > 0);
    };

    const requestSetInsets = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(setInsets);
    };

    requestSetInsets();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', requestSetInsets);
    vv?.addEventListener('scroll', requestSetInsets);
    window.addEventListener('resize', requestSetInsets, { passive: true });
    window.addEventListener('orientationchange', requestSetInsets);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      vv?.removeEventListener('resize', requestSetInsets);
      vv?.removeEventListener('scroll', requestSetInsets);
      window.removeEventListener('resize', requestSetInsets);
      window.removeEventListener('orientationchange', requestSetInsets);
      root.style.setProperty('--vv-bottom', '0px');
      root.style.setProperty('--android-nav-extra', '0px');
      root.classList.remove('android-virtual-nav-active');
    };
  }, []);
}

export default useViewportInsets;
