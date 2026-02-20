import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, MailX, ShieldCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../../services/adminApi';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { useBlobPreview } from '../../../hooks/useBlobPreview';
import { useToast } from '../../../context/ToastContext';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import LoadingSkeleton from '../../../components/LoadingSkeleton';
import styles from '../../../styles/pages/adminCoach.module.css';

const initialDraft = {
  reasonCode: '',
  customReason: ''
};

function AdminCoachApplicationsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [submittingId, setSubmittingId] = useState(null);
  const { previews: certPreviews, setPreview, closePreview, syncKeys, getPreviewKind } = useBlobPreview();

  usePageMeta({
    title: 'Admin Candidature Coach | Motrice',
    description: 'Pannello amministrativo per approvare o rifiutare candidature coach con template email automatici.'
  });

  async function loadData() {
    setLoading(true);
    try {
      const [apps, reasonList] = await Promise.all([
        adminApi.listCoachApplications('pending'),
        adminApi.listRejectionReasons()
      ]);
      setApplications(apps);
      setReasons(reasonList);
    } catch (error) {
      showToast(error.message || 'Impossibile caricare il pannello admin', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    syncKeys(applications.map((application) => application.id));
  }, [applications, syncKeys]);

  function getDraft(id) {
    return drafts[id] || initialDraft;
  }

  async function approve(applicationId) {
    setSubmittingId(applicationId);
    try {
      await adminApi.reviewApplication(applicationId, { decision: 'approved' });
      showToast('Candidatura approvata', 'success');
      await loadData();
    } catch (error) {
      showToast(error.message || 'Errore approvazione', 'error');
    } finally {
      setSubmittingId(null);
    }
  }

  async function reject(application) {
    const draft = getDraft(application.id);
    if (!draft.reasonCode && !draft.customReason.trim()) {
      showToast('Seleziona un motivo o inserisci un motivo personalizzato', 'error');
      return;
    }

    setSubmittingId(application.id);
    try {
      const response = await adminApi.reviewApplication(application.id, {
        decision: 'rejected',
        reason_code: draft.reasonCode,
        custom_reason: draft.customReason
      });

      if (response?.mail?.preview) {
        showToast('Rifiuto registrato e mail automatica generata', 'info');
      } else {
        showToast('Rifiuto registrato', 'info');
      }

      await loadData();
    } catch (error) {
      showToast(error.message || 'Errore rifiuto candidatura', 'error');
    } finally {
      setSubmittingId(null);
    }
  }

  async function openCertification(application) {
    try {
      const { blob, contentType } = await adminApi.fetchCoachCertificationBlob(application.id, 'inline');
      const url = URL.createObjectURL(blob);
      setPreview(application.id, {
        fileName: application.certification_file_name,
        mimeType: contentType || application.certification_mime_type,
        url
      });
    } catch (error) {
      showToast(error.message || 'Impossibile aprire certificazione', 'error');
    }
  }

  if (loading) return <LoadingSkeleton rows={3} />;

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <p className={styles.kicker}>Admin</p>
        <h1>Gestione candidature coach</h1>
        <p className="muted">Sezione riservata e discreta: approva/rifiuta candidature e invia mail motivazionale automatica.</p>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/tutorial')}>
            Tutorial admin
          </Button>
        </div>
      </header>

      {applications.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          imageSrc="/images/default-sport.svg"
          imageAlt="Candidature coach"
          title="Nessuna candidatura pending"
          description="Tutte le candidature risultano gia revisionate."
        />
      ) : (
        <div className={styles.stack}>
          {applications.map((application) => {
            const draft = getDraft(application.id);
            const disabled = submittingId === application.id;

            return (
              <Card key={application.id} className={styles.card}>
                <div className={styles.rowBetween}>
                  <h2>{application.candidate_name}</h2>
                  <span className={styles.pendingBadge}>Pending</span>
                </div>

                <p className="muted">{application.candidate_email}</p>
                <p>
                  <strong>Contatto pubblico:</strong> {application.contact_email}
                </p>
                <p>
                  <strong>Tariffa:</strong> €{Number(application.hourly_rate).toFixed(0)}/h
                </p>
                <p className="muted">{application.bio || 'Bio non fornita'}</p>
                <p className={styles.certLine}>
                  <strong>Certificazione:</strong> {application.certification_file_name} ({application.certification_mime_type})
                </p>
                <Button type="button" variant="ghost" size="sm" icon={Eye} onClick={() => openCertification(application)}>
                  Visualizza certificato
                </Button>

                {certPreviews[application.id] ? (
                  <div className={styles.certPreview}>
                    <div className={styles.previewHead}>
                      <strong>{certPreviews[application.id].fileName}</strong>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        icon={X}
                        onClick={() => closePreview(application.id)}
                      >
                        Chiudi
                      </Button>
                    </div>
                    {getPreviewKind(certPreviews[application.id].mimeType) === 'pdf' ? (
                      <iframe
                        title={certPreviews[application.id].fileName}
                        src={certPreviews[application.id].url}
                        className={styles.certFrame}
                      />
                    ) : getPreviewKind(certPreviews[application.id].mimeType) === 'image' ? (
                      <img
                        src={certPreviews[application.id].url}
                        alt={certPreviews[application.id].fileName}
                        className={styles.certImage}
                      />
                    ) : (
                      <p className="muted">Anteprima non disponibile per questo tipo di file.</p>
                    )}
                  </div>
                ) : null}

                <div className={styles.divider} />

                <label className={styles.field}>
                  Motivo rifiuto preimpostato
                  <select
                    value={draft.reasonCode}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [application.id]: {
                          ...draft,
                          reasonCode: event.target.value
                        }
                      }))
                    }
                  >
                    <option value="">Seleziona motivo</option>
                    {reasons.map((reason) => (
                      <option key={reason.code} value={reason.code}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  Motivo personalizzato (opzionale)
                  <textarea
                    rows="3"
                    value={draft.customReason}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [application.id]: {
                          ...draft,
                          customReason: event.target.value
                        }
                      }))
                    }
                    placeholder="Se compilato, sostituisce il motivo preimpostato nella mail."
                  />
                </label>

                <div className={styles.actions}>
                  <Button type="button" icon={CheckCircle2} disabled={disabled} onClick={() => approve(application.id)}>
                    Approva
                  </Button>
                  <Button type="button" variant="secondary" icon={MailX} disabled={disabled} onClick={() => reject(application)}>
                    Rifiuta + invia mail
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default AdminCoachApplicationsPage;
