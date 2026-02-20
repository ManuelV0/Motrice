import CTAButton from './CTAButton';
import Button from './Button';
import Card from './Card';

function ErrorFallback({ message = 'Si e verificato un errore imprevisto.', debugMessage = '', onRetry }) {
  return (
    <Card as="section" role="alert">
      <h2>Oops</h2>
      <p>{message}</p>
      {debugMessage ? <p><small>Dettaglio: {debugMessage}</small></p> : null}
      {onRetry ? (
        <Button type="button" variant="secondary" onClick={onRetry}>
          Riprova
        </Button>
      ) : null}
      <CTAButton to="/explore">Vai a Esplora</CTAButton>
    </Card>
  );
}

export default ErrorFallback;
