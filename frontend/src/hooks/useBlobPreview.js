import { useCallback, useEffect, useRef, useState } from 'react';

function getPreviewKind(mimeType) {
  const value = String(mimeType || '').toLowerCase();
  if (value.includes('pdf')) return 'pdf';
  if (value.startsWith('image/')) return 'image';
  return 'unsupported';
}

function useBlobPreview() {
  const [previews, setPreviews] = useState({});
  const previewsRef = useRef({});

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((item) => {
        if (item?.url) URL.revokeObjectURL(item.url);
      });
    };
  }, []);

  const setPreview = useCallback((key, payload) => {
    setPreviews((prev) => {
      const next = { ...prev };
      if (next[key]?.url) {
        URL.revokeObjectURL(next[key].url);
      }
      next[key] = payload;
      return next;
    });
  }, []);

  const closePreview = useCallback((key) => {
    setPreviews((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      if (next[key]?.url) {
        URL.revokeObjectURL(next[key].url);
      }
      delete next[key];
      return next;
    });
  }, []);

  const syncKeys = useCallback((validKeys) => {
    const validSet = new Set(validKeys.map((key) => String(key)));
    setPreviews((prev) => {
      let changed = false;
      const next = {};
      Object.entries(prev).forEach(([key, preview]) => {
        if (validSet.has(String(key))) {
          next[key] = preview;
        } else {
          changed = true;
          if (preview?.url) URL.revokeObjectURL(preview.url);
        }
      });
      return changed ? next : prev;
    });
  }, []);

  return {
    previews,
    setPreview,
    closePreview,
    syncKeys,
    getPreviewKind
  };
}

export { useBlobPreview };
