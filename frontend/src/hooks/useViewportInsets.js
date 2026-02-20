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
      root.style.setProperty('--vv-bottom', `${Math.round(bottomOffset)}px`);

      let androidExtra = 0;
      if (isAndroid && bottomOffset === 0) {
        const screenHeight = Number(window.screen?.height || 0);
        const availHeight = Number(window.screen?.availHeight || 0);
        const fallbackInset = Math.max(0, screenHeight - availHeight);
        androidExtra = Math.min(48, Math.round(fallbackInset));
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
