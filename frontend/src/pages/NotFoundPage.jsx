import CTAButton from '../components/CTAButton';
import { usePageMeta } from '../hooks/usePageMeta';

function NotFoundPage() {
  usePageMeta({
    title: 'Pagina non trovata | Motrice',
    description: 'La pagina richiesta non esiste o e stata spostata.'
  });

  return (
    <section className="card">
      <h1>404</h1>
      <p>La pagina che stai cercando non esiste.</p>
      <CTAButton to="/">Torna alla home</CTAButton>
    </section>
  );
}

export default NotFoundPage;
