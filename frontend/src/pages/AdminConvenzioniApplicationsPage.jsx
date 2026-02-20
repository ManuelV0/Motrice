import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, QrCode, ShieldCheck, TicketCheck, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import styles from '../styles/pages/adminConvenzioni.module.css';

const STATUS_OPTIONS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approvate' },
  { key: 'rejected', label: 'Rifiutate' },
  { key: 'all', label: 'Tutte' }
];

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/d';
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function defaultAdminContractText(application) {
  const today = new Date().toLocaleDateString('it-IT');
  return `CONTRATTO CONVENZIONE
Data: ${today}
Partner: ${application.organization}
Tipologia: ${application.type}
Citta: ${application.city}
Contatto: ${application.contact}

Termini e condizioni:
1. Il partner aderisce alle regole convenzioni Motrice.
2. Le promo disponibili seguono il piano selezionato.
3. I voucher sono verificati con regole anti-frode.

Note:
${application.message || 'Nessuna nota partner'}
`;
}

function renderReceivedContractPreview(application, styles) {
  const dataUrl = String(application?.signed_contract_data_url || '');
  const mime = String(application?.signed_contract_mime_type || '').toLowerCase();
  if (!dataUrl) return null;

  function decodeDataUrlText(url) {
    try {
      const commaIndex = url.indexOf(',');
      if (commaIndex < 0) return '';
      const meta = url.slice(0, commaIndex);
      const payload = url.slice(commaIndex + 1);
      const isBase64 = /;base64/i.test(meta);
      if (isBase64) {
        return decodeURIComponent(escape(window.atob(payload)));
      }
      return decodeURIComponent(payload);
    } catch {
      return '';
    }
  }

  if (mime.includes('image/')) {
    return (
      <img
        className={styles.receivedImagePreview}
        src={dataUrl}
        alt={`Contratto firmato ${application.organization || ''}`}
      />
    );
  }

  if (mime.includes('pdf') || dataUrl.startsWith('data:application/pdf')) {
    return <iframe className={styles.receivedDocPreview} src={dataUrl} title={`Preview ${application.id}`} />;
  }

  const isTextLike =
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    dataUrl.startsWith('data:text/');
  if (isTextLike) {
    const text = decodeDataUrlText(dataUrl);
    return text ? <pre className={styles.receivedTextPreview}>{text}</pre> : <p className="muted">Impossibile leggere il contenuto testuale.</p>;
  }

  return (
    <p className="muted">
      Preview non disponibile per questo formato ({application.signed_contract_mime_type || 'n/d'}). Usa download.
    </p>
  );
}

function AdminConvenzioniApplicationsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [applications, setApplications] = useState([]);
  const [allApplicationsById, setAllApplicationsById] = useState({});
  const [vouchers, setVouchers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [voucherStatusFilter, setVoucherStatusFilter] = useState('all');
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState('all');
  const [submittingId, setSubmittingId] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherNote, setVoucherNote] = useState('');
  const [notesById, setNotesById] = useState({});
  const [contractDraftById, setContractDraftById] = useState({});
  const [contractExtraById, setContractExtraById] = useState({});
  const [contractTemplateByAppId, setContractTemplateByAppId] = useState({});
  const [contractOpenById, setContractOpenById] = useState({});
  const [savingContractId, setSavingContractId] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  usePageMeta({
    title: 'Admin Candidature Convenzioni | Motrice',
    description: 'Gestione candidature partner convenzioni: approva o rifiuta palestre e associazioni.'
  });

  async function loadApplications(nextStatus = statusFilter) {
    try {
      const items = await api.listConventionApplications(nextStatus);
      setApplications(items);
    } catch (error) {
      showToast(error.message || 'Impossibile caricare le candidature convenzioni', 'error');
    }
  }

  async function loadAllApplicationsIndex() {
    try {
      const items = await api.listConventionApplications('all');
      const next = {};
      (Array.isArray(items) ? items : []).forEach((item) => {
        const key = String(item.id || '');
        if (!key) return;
        next[key] = item;
      });
      setAllApplicationsById(next);
    } catch {
      setAllApplicationsById({});
    }
  }

  async function loadContractTemplates() {
    try {
      const items = await api.listConventionContractTemplates();
      const latestByAppId = {};
      (Array.isArray(items) ? items : []).forEach((item) => {
        const key = String(item.application_id || '');
        if (!key) return;
        if (!latestByAppId[key]) latestByAppId[key] = item;
      });
      setContractTemplateByAppId(latestByAppId);
    } catch {
      setContractTemplateByAppId({});
    }
  }

  async function loadVouchers(nextStatus = voucherStatusFilter) {
    try {
      const items = await api.listConventionVouchers(nextStatus);
      setVouchers(items);
    } catch (error) {
      showToast(error.message || 'Impossibile caricare i voucher convenzioni', 'error');
    }
  }

  async function loadSubscriptions(nextStatus = subscriptionStatusFilter) {
    try {
      const items = await api.listConventionPartnerSubscriptions(nextStatus);
      setSubscriptions(items);
    } catch (error) {
      showToast(error.message || 'Impossibile caricare abbonamenti convenzioni', 'error');
    }
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setLoading(true);
      await Promise.all([
        loadApplications(statusFilter),
        loadAllApplicationsIndex(),
        loadVouchers(voucherStatusFilter),
        loadSubscriptions(subscriptionStatusFilter),
        loadContractTemplates()
      ]);
      if (active) setLoading(false);
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    loadApplications(statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    if (loading) return;
    loadVouchers(voucherStatusFilter);
  }, [voucherStatusFilter]);

  useEffect(() => {
    if (loading) return;
    loadSubscriptions(subscriptionStatusFilter);
  }, [subscriptionStatusFilter]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pendingCount = useMemo(
    () => applications.filter((application) => application.status === 'pending').length,
    [applications]
  );
  const allApplications = useMemo(() => Object.values(allApplicationsById), [allApplicationsById]);
  const pendingGlobalCount = useMemo(
    () => allApplications.filter((item) => String(item?.status || '') === 'pending').length,
    [allApplications]
  );
  const missingContractCount = useMemo(
    () =>
      allApplications.filter((item) => {
        const appId = String(item?.id || '');
        const template = contractTemplateByAppId[appId];
        return (
          String(item?.status || '') === 'pending' &&
          (!template || !item?.contract_terms_accepted || !item?.signed_contract_uploaded_at)
        );
      }).length,
    [allApplications, contractTemplateByAppId]
  );
  const voucherToVerifyCount = useMemo(
    () => vouchers.filter((item) => String(item?.status || '') === 'active').length,
    [vouchers]
  );
  const expiredSubscriptionsCount = useMemo(
    () => subscriptions.filter((item) => String(item?.computed_status || '') === 'expired').length,
    [subscriptions]
  );

  async function review(applicationId, decision) {
    setSubmittingId(applicationId);
    try {
      const note = notesById[applicationId] || '';
      await api.reviewConventionApplication(applicationId, { decision, note });
      showToast(decision === 'approved' ? 'Candidatura approvata' : 'Candidatura rifiutata', 'success');
      await Promise.all([loadApplications(statusFilter), loadAllApplicationsIndex(), loadSubscriptions(subscriptionStatusFilter)]);
    } catch (error) {
      showToast(error.message || 'Errore revisione candidatura', 'error');
    } finally {
      setSubmittingId('');
    }
  }

  async function saveContractTemplate(application) {
    const appId = String(application.id || '');
    if (!appId) return;
    const hasManualDraft = Object.prototype.hasOwnProperty.call(contractDraftById, appId);
    const customText = String(
      contractDraftById[appId] ?? contractTemplateByAppId[appId]?.contract_text ?? defaultAdminContractText(application)
    ).trim();
    const extraTerms = String(contractExtraById[appId] || '').trim();
    setSavingContractId(appId);
    try {
      const payload = {
        application_id: appId,
        duration_months: 12,
        extra_terms: extraTerms
      };
      if (hasManualDraft) {
        if (customText.length < 80) {
          showToast('Contratto troppo breve', 'error');
          setSavingContractId('');
          return;
        }
        payload.contract_text = customText;
      }
      const template = await api.createConventionContractTemplate(payload);
      setContractTemplateByAppId((prev) => ({ ...prev, [appId]: template }));
      setContractDraftById((prev) => ({ ...prev, [appId]: template.contract_text }));
      showToast('Contratto salvato per la candidatura', 'success');
    } catch (error) {
      showToast(error.message || 'Errore salvataggio contratto', 'error');
    } finally {
      setSavingContractId('');
    }
  }

  async function redeemVoucher() {
    const token = String(voucherInput || '').trim();
    if (!token) {
      showToast('Inserisci codice voucher o URL completo', 'error');
      return;
    }
    const voucherIdMatch = token.match(/\/convenzioni\/voucher\/([A-Za-z0-9_-]+)$/) || token.match(/^(cv_[A-Za-z0-9_-]+)$/);
    const voucherId = voucherIdMatch?.[1] || voucherIdMatch?.[0] || '';
    const voucherDraft = vouchers.find((item) => String(item.id) === String(voucherId));
    const partnerProfileId = String(voucherDraft?.partner?.id || '').replace(/^partner_profile_/, '');
    setRedeeming(true);
    try {
      await api.redeemConventionVoucher(token, {
        source: 'manual_admin',
        note: voucherNote,
        partner_profile_id: partnerProfileId || undefined
      });
      showToast('Voucher riscattato con successo', 'success');
      setVoucherInput('');
      setVoucherNote('');
      await loadVouchers(voucherStatusFilter);
    } catch (error) {
      showToast(error.message || 'Errore riscatto voucher', 'error');
    } finally {
      setRedeeming(false);
    }
  }

  if (loading) return <LoadingSkeleton rows={3} />;

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <p className={styles.kicker}>Admin</p>
        <h1>Portale Admin Convenzioni</h1>
        <p className="muted">Controllo operativo candidature, contratti e voucher in un unico flusso.</p>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/tutorial')}>
            Tutorial admin
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/convenzioni-generator')}>
            Generatore contratti (admin)
          </Button>
        </div>
      </header>

      <Card className={styles.filterCard}>
        <div className={styles.filterTop}>
          <h2>Overview operativa</h2>
        </div>
        <div className={styles.metricsGrid}>
          <article className={styles.metricCard}>
            <p className={styles.metricLabel}>Candidature pending</p>
            <p className={styles.metricValue}>{pendingGlobalCount}</p>
          </article>
          <article className={styles.metricCard}>
            <p className={styles.metricLabel}>Blocchi contratto/firma</p>
            <p className={styles.metricValue}>{missingContractCount}</p>
          </article>
          <article className={styles.metricCard}>
            <p className={styles.metricLabel}>Voucher da verificare</p>
            <p className={styles.metricValue}>{voucherToVerifyCount}</p>
          </article>
          <article className={styles.metricCard}>
            <p className={styles.metricLabel}>Abbonamenti scaduti</p>
            <p className={styles.metricValue}>{expiredSubscriptionsCount}</p>
          </article>
        </div>
      </Card>

      <Card className={styles.filterCard}>
        <div className={styles.filterTop}>
          <h2>Stato candidature</h2>
          <span className={styles.pendingBadge}>Pending: {pendingCount}</span>
        </div>
        <div className={styles.chips}>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`${styles.chip} ${statusFilter === option.key ? styles.chipActive : ''}`}
              onClick={() => setStatusFilter(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className={styles.filterCard}>
        <div className={styles.filterTop}>
          <h2>Verifica voucher convenzioni</h2>
          <span className={styles.pendingBadge}>Voucher: {vouchers.length}</span>
        </div>
        <div className={styles.redeemGrid}>
          <label className={styles.field}>
            Codice voucher o URL QR
            <input
              value={voucherInput}
              onChange={(event) => setVoucherInput(event.target.value)}
              placeholder="cv_... oppure https://.../convenzioni/voucher/cv_..."
            />
          </label>
          <label className={styles.field}>
            Nota verifica (opzionale)
            <input
              value={voucherNote}
              onChange={(event) => setVoucherNote(event.target.value.slice(0, 240))}
              placeholder="Es. check-in reception ore 18:40"
            />
          </label>
        </div>
        <div className={styles.actions}>
          <Button type="button" icon={TicketCheck} disabled={redeeming} onClick={redeemVoucher}>
            Riscatta voucher
          </Button>
        </div>

        <div className={styles.chips}>
          {['all', 'active', 'redeemed', 'expired'].map((status) => (
            <button
              key={status}
              type="button"
              className={`${styles.chip} ${voucherStatusFilter === status ? styles.chipActive : ''}`}
              onClick={() => setVoucherStatusFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>

        <div className={styles.stack}>
          {vouchers.slice(0, 12).map((voucher) => (
            <Card key={voucher.id} className={styles.card}>
              <div className={styles.rowBetween}>
                <h2>{voucher.partner?.name || 'Partner'}</h2>
                <span className={`${styles.status} ${styles[`status${voucher.status}`]}`}>
                  {voucher.status}
                </span>
              </div>
              <p className="muted">
                <QrCode size={14} aria-hidden="true" /> {voucher.id}
              </p>
              <p className="muted">
                Utente #{voucher.user_id} · {voucher.partner?.city || 'n/d'}
              </p>
              <p className="muted">
                Creato: {formatDate(voucher.created_at)} · Scade: {formatDate(voucher.expires_at)}
              </p>
              {voucher.redeemed_at ? (
                <p className="muted">
                  Riscattato: {formatDate(voucher.redeemed_at)} (admin #{voucher.redeemed_by_user_id})
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      </Card>

      <Card className={styles.filterCard}>
        <div className={styles.filterTop}>
          <h2>Abbonamenti convenzioni (durata 1 anno)</h2>
          <span className={styles.pendingBadge}>Profili: {subscriptions.length}</span>
        </div>
        <div className={styles.chips}>
          {['all', 'active', 'expired'].map((status) => (
            <button
              key={status}
              type="button"
              className={`${styles.chip} ${subscriptionStatusFilter === status ? styles.chipActive : ''}`}
              onClick={() => setSubscriptionStatusFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>

        <div className={styles.stack}>
          {subscriptions.slice(0, 14).map((sub) => {
            const expiresMs = Date.parse(sub.subscription_expires_at || '');
            const remainingMs = Number.isFinite(expiresMs) ? Math.max(0, expiresMs - nowMs) : 0;
            const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
            const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const linkedApplication = allApplicationsById[String(sub.application_id || '')] || null;
            return (
              <Card key={sub.id} className={styles.card}>
                <div className={styles.rowBetween}>
                  <h2>{sub.organization}</h2>
                  <span className={`${styles.status} ${styles[`status${sub.computed_status}`]}`}>
                    {sub.computed_status}
                  </span>
                </div>
                <p className="muted">
                  Owner #{sub.owner_user_id} · {sub.city} · Piano {String(sub.plan || 'free').toUpperCase()}
                </p>
                <p className="muted">
                  Inizio: {formatDate(sub.subscription_started_at)} · Scadenza: {formatDate(sub.subscription_expires_at)}
                </p>
                <p>
                  <strong>Timer:</strong> {sub.computed_status === 'active' ? `${days}g ${hours}h` : 'scaduto'}
                </p>
                <p>
                  <strong>Contratto ricevuto:</strong>{' '}
                  {linkedApplication?.signed_contract_uploaded_at
                    ? `si (${formatDate(linkedApplication.signed_contract_uploaded_at)})`
                    : 'no'}
                </p>
                {linkedApplication?.signed_contract_uploaded_at ? (
                  <p>
                    <strong>Firma dichiarata:</strong>{' '}
                    {String(linkedApplication.signature_method || '').toUpperCase() || 'n/d'}
                    {linkedApplication.signature_provider
                      ? ` · Provider: ${linkedApplication.signature_provider}`
                      : ''}
                  </p>
                ) : null}
                {linkedApplication?.signed_contract_data_url ? (
                  <details className={styles.receivedContractBox}>
                    <summary>Preview contratto ricevuto</summary>
                    <div className={styles.receivedContractActions}>
                      <a
                        className={styles.inlineLink}
                        href={linkedApplication.signed_contract_data_url}
                        download={linkedApplication.signed_contract_file_name || `firmato-${String(sub.application_id || sub.id)}`}
                      >
                        Scarica contratto firmato
                      </a>
                    </div>
                    {renderReceivedContractPreview(
                      {
                        ...linkedApplication,
                        organization: sub.organization
                      },
                      styles
                    )}
                  </details>
                ) : null}
              </Card>
            );
          })}
        </div>
      </Card>

      {applications.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          imageSrc="/images/default-sport.svg"
          imageAlt="Candidature convenzioni"
          title="Nessuna candidatura in questa vista"
          description="Quando arriveranno nuove richieste le troverai qui."
        />
      ) : (
        <div className={styles.stack}>
          {applications.map((application) => {
            const disabled = submittingId === application.id;
            const appId = String(application.id || '');
            const template = contractTemplateByAppId[appId] || null;
            const contractOpen = Boolean(contractOpenById[appId]);
            const draftText =
              contractDraftById[appId] ?? template?.contract_text ?? defaultAdminContractText(application);
            const canApprove = Boolean(
              template &&
              application.contract_terms_accepted &&
              application.signed_contract_uploaded_at
            );
            const isFinalizedFreeContract = Boolean(
              application.status === 'approved' &&
              String(application.partner_plan || '').toLowerCase() === 'free' &&
              application.signed_contract_uploaded_at
            );
            return (
              <Card key={application.id} className={styles.card}>
                <div className={styles.rowBetween}>
                  <h2>{application.organization}</h2>
                  <span className={`${styles.status} ${styles[`status${application.status}`]}`}>
                    {application.status}
                  </span>
                </div>
                <p className="muted">
                  {application.type} · {application.city}
                </p>
                <p>
                  <strong>Account richiedente:</strong>{' '}
                  {application.submitted_by_display_name || `Utente #${application.submitted_by_user_id || 'n/d'}`}
                </p>
                <p>
                  <strong>Piano:</strong> {application.partner_plan === 'premium' ? 'Premium' : 'Free'}
                  {' · '}
                  <strong>Promo disponibili:</strong> {Number(application.promo_limit || 0)}
                  {application.partner_plan === 'premium'
                    ? ` (corsi: ${Number(application.courses_count || 0)} × 7)`
                    : ' (fisse)'}
                </p>
                <p>
                  <strong>Contatto:</strong> {application.contact}
                </p>
                <p className="muted">{application.message || 'Nessun messaggio allegato'}</p>
                <p className="muted">Inviata: {formatDate(application.created_at)}</p>
                {application.reviewed_at ? (
                  <p className="muted">Revisionata: {formatDate(application.reviewed_at)}</p>
                ) : null}
                <p>
                  <strong>Documento firmato partner:</strong>{' '}
                  {application.signed_contract_uploaded_at
                    ? `Ricevuto il ${formatDate(application.signed_contract_uploaded_at)}`
                    : 'non ricevuto'}
                </p>
                {application.signed_contract_uploaded_at ? (
                  <p>
                    <strong>Firma dichiarata:</strong>{' '}
                    {String(application.signature_method || '').toUpperCase() || 'n/d'}
                    {application.signature_provider ? ` · Provider: ${application.signature_provider}` : ''}
                  </p>
                ) : null}
                <p>
                  <strong>Termini accettati partner:</strong>{' '}
                  {application.contract_terms_accepted
                    ? `si (${formatDate(application.contract_terms_accepted_at)})`
                    : 'no'}
                </p>
                {application.signed_contract_data_url ? (
                  <details className={styles.receivedContractBox}>
                    <summary>Contratto firmato ricevuto (preview)</summary>
                    <div className={styles.receivedContractActions}>
                      <a
                        className={styles.inlineLink}
                        href={application.signed_contract_data_url}
                        download={application.signed_contract_file_name || `firmato-${appId}`}
                      >
                        Scarica documento firmato caricato
                      </a>
                    </div>
                    {renderReceivedContractPreview(application, styles)}
                  </details>
                ) : null}

                <label className={styles.field}>
                  Nota admin
                  <textarea
                    rows="3"
                    value={notesById[application.id] ?? application.admin_note ?? ''}
                    onChange={(event) =>
                      setNotesById((prev) => ({
                        ...prev,
                        [application.id]: event.target.value.slice(0, 400)
                      }))
                    }
                    placeholder="Nota interna sulla candidatura (opzionale)"
                  />
                </label>

                {application.status === 'pending' ? (
                  <div className={styles.actions}>
                    <Button
                      type="button"
                      icon={CheckCircle2}
                      disabled={disabled || !canApprove}
                      onClick={() => review(application.id, 'approved')}
                    >
                      Approva
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      icon={XCircle}
                      disabled={disabled}
                      onClick={() => review(application.id, 'rejected')}
                    >
                      Rifiuta
                    </Button>
                  </div>
                ) : null}
                {application.status === 'pending' && !canApprove ? (
                  <p className="muted">
                    Per approvare: genera il contratto, attendi lettura/accettazione e caricamento del firmato.
                  </p>
                ) : null}

                <div className={styles.contractBox}>
                  <div className={styles.rowBetween}>
                    <h3>Contratto per {application.organization}</h3>
                    {!isFinalizedFreeContract ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setContractOpenById((prev) => ({
                            ...prev,
                            [appId]: !prev[appId]
                          }))
                        }
                      >
                        {contractOpen ? 'Chiudi box' : 'Apri box'}
                      </Button>
                    ) : null}
                  </div>
                  {isFinalizedFreeContract ? (
                    <div className={styles.contractStack}>
                      <p className="muted">
                        Contratto concluso (piano Free attivo). Rimane disponibile solo il contratto firmato ricevuto.
                      </p>
                      <div className={styles.receivedContractActions}>
                        <a
                          className={styles.inlineLink}
                          href={application.signed_contract_data_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Visualizza contratto firmato
                        </a>
                        <a
                          className={styles.inlineLink}
                          href={application.signed_contract_data_url}
                          download={application.signed_contract_file_name || `firmato-${appId}`}
                        >
                          Scarica contratto firmato
                        </a>
                      </div>
                    </div>
                  ) : contractOpen ? (
                    <div className={styles.contractStack}>
                      <label className={styles.field}>
                        Testo individuale (inserito nel mezzo del template predefinito)
                        <textarea
                          rows="3"
                          value={contractExtraById[appId] ?? ''}
                          onChange={(event) =>
                            setContractExtraById((prev) => ({
                              ...prev,
                              [appId]: event.target.value.slice(0, 4000)
                            }))
                          }
                          placeholder="Clausole specifiche per questa palestra/associazione"
                        />
                      </label>
                      <label className={styles.field}>
                        Testo contratto precompilato
                        <textarea
                          rows="8"
                          value={draftText}
                          onChange={(event) =>
                            setContractDraftById((prev) => ({
                              ...prev,
                              [appId]: event.target.value.slice(0, 24000)
                            }))
                          }
                        />
                      </label>
                      <div className={styles.actions}>
                        <Button
                          type="button"
                          size="sm"
                          disabled={savingContractId === appId}
                          onClick={() => saveContractTemplate(application)}
                        >
                          {savingContractId === appId ? 'Salvataggio...' : 'Salva contratto'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            downloadTextFile(
                              `contratto-${String(application.organization || 'partner').replace(/\s+/g, '-').toLowerCase()}.txt`,
                              draftText
                            )
                          }
                        >
                          Scarica contratto
                        </Button>
                      </div>
                      <details className={styles.contractPreview}>
                        <summary>Preview contratto</summary>
                        <pre>{draftText}</pre>
                      </details>
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default AdminConvenzioniApplicationsPage;
