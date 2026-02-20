import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Button from './Button';
import { api } from '../services/api';
import { getAuthSession } from '../services/authSession';
import styles from '../styles/pages/convenzioni.module.css';

function ConvenzioniContractPanel({
  isAuthenticated,
  applicationStatus,
  partnerPlan,
  refreshKey,
  formatDateTime,
  showToast
}) {
  const [contractContext, setContractContext] = useState({
    loaded: false,
    application: null,
    template: null
  });
  const [signedFile, setSignedFile] = useState(null);
  const [isUploadingSignedContract, setIsUploadingSignedContract] = useState(false);
  const [contractAccepted, setContractAccepted] = useState(false);
  const [signatureMethod, setSignatureMethod] = useState('spid');
  const [signatureProvider, setSignatureProvider] = useState('');
  const [termsOpen, setTermsOpen] = useState(false);

  const hasSignedContract = Boolean(contractContext.application?.signed_contract_uploaded_at);
  const isFreePlanActiveAndLocked = Boolean(
    applicationStatus === 'active' && String(partnerPlan || '').toLowerCase() === 'free' && hasSignedContract
  );

  useEffect(() => {
    let active = true;

    async function loadContractContext() {
      try {
        const session = getAuthSession();
        if (!session.isAuthenticated || !session.userId || !isAuthenticated) {
          if (!active) return;
          setContractContext({
            loaded: true,
            application: null,
            template: null
          });
          return;
        }
        const context = await api.getMyConventionContractContext();
        if (!active) return;
        setContractContext({
          loaded: true,
          application: context?.application || null,
          template: context?.template || null
        });
      } catch {
        if (!active) return;
        setContractContext({
          loaded: true,
          application: null,
          template: null
        });
      }
    }

    loadContractContext();
    function onFocus() {
      loadContractContext();
    }
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [isAuthenticated, refreshKey]);

  function openSignedContract() {
    const fileUrl = String(contractContext.application?.signed_contract_data_url || '').trim();
    if (!fileUrl) {
      showToast('Nessun contratto firmato disponibile', 'info');
      return;
    }
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Impossibile leggere il file'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadSignedContract(event) {
    event.preventDefault();
    const applicationId = String(contractContext.application?.id || '');
    if (!applicationId) {
      showToast('Invia prima la candidatura partner', 'error');
      return;
    }
    if (!contractContext.template) {
      showToast('Il contratto precompilato non e ancora disponibile. Attendi revisione admin.', 'info');
      return;
    }
    if (!signedFile) {
      showToast('Seleziona il documento firmato da caricare', 'error');
      return;
    }
    if (!contractAccepted) {
      showToast('Devi accettare i termini e condizioni prima dell invio', 'error');
      return;
    }
    if (signatureMethod === 'spid' && String(signatureProvider).trim().length < 2) {
      showToast('Inserisci il provider SPID utilizzato', 'error');
      return;
    }

    setIsUploadingSignedContract(true);
    try {
      const dataUrl = await fileToDataUrl(signedFile);
      const updatedApplication = await api.submitSignedConventionContract({
        application_id: applicationId,
        terms_accepted: contractAccepted,
        signature_method: signatureMethod,
        signature_provider: signatureProvider,
        file_name: signedFile.name || 'contratto-firmato',
        mime_type: signedFile.type || 'application/octet-stream',
        file_data_url: dataUrl
      });
      setContractContext((prev) => ({
        ...prev,
        application: updatedApplication
      }));
      setSignedFile(null);
      setContractAccepted(false);
      setSignatureMethod('spid');
      setSignatureProvider('');
      showToast('Documento firmato caricato con successo', 'success');
    } catch (error) {
      showToast(error.message || 'Errore caricamento documento firmato', 'error');
    } finally {
      setIsUploadingSignedContract(false);
    }
  }

  return (
    <section className={styles.myCertificate}>
      {!isAuthenticated ? (
        <p className="muted">Effettua login per vedere i termini del contratto.</p>
      ) : !contractContext.loaded ? (
        <p className="muted">Caricamento contratto...</p>
      ) : !contractContext.application ? (
        <p className="muted">Invia prima la candidatura partner per ricevere il contratto precompilato da admin.</p>
      ) : !contractContext.template ? (
        <p className="muted">Contratto precompilato non ancora emesso da admin. Ti apparira qui appena disponibile.</p>
      ) : (
        <div className={styles.myCertificateMeta}>
          <p>
            <strong>Contratto ID:</strong> {contractContext.template.id}
          </p>
          <p>
            <strong>Associazione/Palestra:</strong> {contractContext.template.organization}
          </p>
          <p>
            <strong>Creato:</strong> {formatDateTime(contractContext.template.created_at)}
          </p>
          <p>
            <strong>Stato documento firmato:</strong> {hasSignedContract ? 'caricato' : 'non caricato'}
          </p>
          {hasSignedContract ? (
            <p>
              <strong>Upload:</strong> {formatDateTime(contractContext.application.signed_contract_uploaded_at)}
            </p>
          ) : null}
          {hasSignedContract ? (
            <p>
              <strong>Metodo firma:</strong>{' '}
              {String(contractContext.application.signature_method || '').toUpperCase() || 'n/d'}
              {contractContext.application.signature_provider
                ? ` · Provider: ${contractContext.application.signature_provider}`
                : ''}
            </p>
          ) : null}
          <section className={styles.contractPanel}>
            <button
              type="button"
              className={styles.contractToggle}
              onClick={() => setTermsOpen((prev) => !prev)}
              aria-expanded={termsOpen}
              aria-controls="convenzioni-contract-terms"
            >
              <span className={styles.contractToggleLabelWrap}>
                <strong className={styles.contractToggleTitle}>Dettagli e termini contratto</strong>
                <span className={styles.contractToggleHint}>Scopri di piu</span>
              </span>
              <span
                className={`${styles.contractToggleIcon} ${termsOpen ? styles.contractToggleIconOpen : ''}`}
                aria-hidden="true"
              >
                <ChevronDown size={24} strokeWidth={2.6} />
              </span>
            </button>
            <div
              id="convenzioni-contract-terms"
              className={`${styles.contractBody} ${termsOpen ? styles.contractBodyOpen : ''}`}
            >
              <pre className={styles.contractText}>{contractContext.template.contract_text}</pre>
            </div>
          </section>
          {isFreePlanActiveAndLocked ? (
            <p className="muted">
              Contratto approvato con piano Free attivo. Sezione termini e caricamento disattivata.
            </p>
          ) : (
            <form className={styles.contractUploadForm} onSubmit={uploadSignedContract}>
              <label>
                Metodo firma
                <select value={signatureMethod} onChange={(event) => setSignatureMethod(event.target.value)}>
                  <option value="spid">SPID</option>
                  <option value="qes">QES (qualificata)</option>
                  <option value="fea">FEA</option>
                  <option value="other">Altro</option>
                </select>
              </label>
              {signatureMethod === 'spid' ? (
                <label>
                  Provider SPID
                  <input
                    value={signatureProvider}
                    onChange={(event) => setSignatureProvider(event.target.value.slice(0, 120))}
                    placeholder="Es. PosteID, Aruba ID, LepidaID"
                  />
                </label>
              ) : null}
              <label>
                Carica contratto firmato
                <input
                  type="file"
                  accept=".pdf,.p7m,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(event) => setSignedFile(event.target.files?.[0] || null)}
                />
              </label>
              <label className={styles.acceptLine}>
                <input
                  type="checkbox"
                  checked={contractAccepted}
                  onChange={(event) => setContractAccepted(event.target.checked)}
                />
                Ho letto e accettato il contratto precompilato, e confermo che il file allegato e firmato.
              </label>
              <Button type="submit" size="sm" disabled={isUploadingSignedContract}>
                {isUploadingSignedContract ? 'Caricamento...' : 'Invia documento firmato'}
              </Button>
            </form>
          )}
          {hasSignedContract ? (
            <div className={styles.signedContractActions}>
              <Button type="button" size="sm" variant="secondary" onClick={openSignedContract}>
                Visualizza contratto firmato
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default ConvenzioniContractPanel;
