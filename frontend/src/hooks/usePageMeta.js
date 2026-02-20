import { useEffect } from 'react';

export function usePageMeta({ title, description }) {
  useEffect(() => {
    if (title) document.title = title;

    if (description) {
      const element = document.querySelector('meta[name="description"]');
      if (element) {
        element.setAttribute('content', description);
      }
    }
  }, [title, description]);
}
