import { useEffect, useMemo, useState } from 'react';
import { Download, FileCheck2, FileText, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/Card';
import Button from '../components/Button';
import { useToast } from '../context/ToastContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { api } from '../services/api';
import styles from '../styles/pages/convenzioneAgreementGenerator.module.css';

function nowLocalDate() {
  return new Date().toLocaleDateString('it-IT');
}

function isoNow() {
  return new Date().toISOString();
}

function formatDateTime(value) {
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

function buildAgreementText(form) {
  const durationLabel = `${form.durationMonths} mesi`;
  return `CONVENZIONE DI COLLABORAZIONE
Data: ${nowLocalDate()}

Tra:
Parte A: ${form.partyAName}
Codice Fiscale/P.IVA: ${form.partyATaxCode || 'n/d'}
Sede: ${form.partyAAddress || 'n/d'}

Parte B: ${form.partyBName}
Codice Fiscale/P.IVA: ${form.partyBTaxCode || 'n/d'}
Sede: ${form.partyBAddress || 'n/d'}

Oggetto della convenzione:
${form.objectText}

Durata:
La presente convenzione ha durata di ${durationLabel} a decorrere dalla data di sottoscrizione.

Corrispettivi e condizioni economiche:
${form.economicTerms}

Clausole operative:
1. Le Parti si impegnano a rispettare i reciproci obblighi di buona fede e collaborazione.
2. Eventuali modifiche saranno valide solo se formalizzate per iscritto.
3. Le Parti dichiarano di aver letto e accettato termini e condizioni collegati alla presente convenzione.

Legge applicabile e foro:
Legge applicabile: ${form.governingLaw}
Foro competente: ${form.jurisdiction}

Firma elettronica:
Firmatario: ${form.signerName} (${form.signerRole})
Email firmatario: ${form.signerEmail}
Tipo certificato: ${form.certificateType}
Autorita certificante: ${form.certificateAuthority}
Seriale certificato: ${form.certificateSerial}
Paese emissione certificato: ${form.certificateCountry || 'n/d'}

Accettazione termini:
Accettato: ${form.acceptTerms ? 'SI' : 'NO'}
Timestamp accettazione: ${form.acceptedAt || 'n/d'}

Note legali:
La validita legale dipende dalla normativa applicabile, dall'identificazione delle Parti
e dall'utilizzo di una firma elettronica conforme ai requisiti di legge.`;
}

async function sha256Hex(text) {
  if (!window.crypto?.subtle) {
    throw new Error('Web Crypto non disponibile in questo browser');
  }
  const input = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function downloadFile(filename, content, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ConvenzioneAgreementGeneratorPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState({
    partyAName: '',
    partyATaxCode: '',
    partyAAddress: '',
    partyBName: '',
    partyBTaxCode: '',
    partyBAddress: '',
    objectText: '',
    economicTerms: '',
    durationMonths: 12,
    governingLaw: 'Italia',
    jurisdiction: 'Foro di Milano',
    signerName: '',
    signerRole: '',
    signerEmail: '',
    certificateType: 'QES',
    certificateAuthority: '',
    certificateSerial: '',
    certificateCountry: 'IT',
    acceptTerms: false,
    acceptedAt: ''
  });

  usePageMeta({
    title: 'Generatore Convenzioni | Motrice',
    description:
      'Genera una convenzione di collaborazione, registra accettazione termini e metadati del certificato elettronico.'
  });

  useEffect(() => {
    let active = true;
    async function loadRecords() {
      try {
        const items = await api.listConventionAgreementRecords();
        if (!active) return;
        setRecords(Array.isArray(items) ? items : []);
      } catch {
        if (!active) return;
        setRecords([]);
      }
    }
    loadRecords();
    return () => {
      active = false;
    };
  }, []);

  const agreementText = useMemo(() => buildAgreementText(form), [form]);

  function patchForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAgreement() {
    if (!form.acceptTerms) {
      showToast('Devi accettare termini e condizioni prima della firma', 'error');
      return;
    }
    if (
      String(form.partyAName).trim().length < 2 ||
      String(form.partyBName).trim().length < 2 ||
      String(form.objectText).trim().length < 10 ||
      String(form.economicTerms).trim().length < 5
    ) {
      showToast('Compila i campi principali della convenzione', 'error');
      return;
    }
    if (
      !String(form.signerName).trim() ||
      !String(form.signerEmail).trim() ||
      !String(form.certificateAuthority).trim() ||
      !String(form.certificateSerial).trim()
    ) {
      showToast('Compila firmatario e dati certificato elettronico', 'error');
      return;
    }

    const acceptedAt = isoNow();
    const finalText = buildAgreementText({ ...form, acceptedAt });
    setIsSaving(true);
    try {
      const hash = await sha256Hex(finalText);
      const created = await api.createConventionAgreementRecord({
        party_a: {
          name: form.partyAName,
          vat_or_tax_code: form.partyATaxCode,
          address: form.partyAAddress
        },
        party_b: {
          name: form.partyBName,
          vat_or_tax_code: form.partyBTaxCode,
          address: form.partyBAddress
        },
        signer: {
          name: form.signerName,
          role: form.signerRole,
          email: form.signerEmail
        },
        certificate: {
          type: form.certificateType,
          authority: form.certificateAuthority,
          serial: form.certificateSerial,
          issued_country: form.certificateCountry
        },
        terms_accepted: true,
        terms_accepted_at: acceptedAt,
        document_text: finalText,
        document_hash_sha256: hash
      });
      setRecords((prev) => [created, ...prev]);
      patchForm('acceptedAt', acceptedAt);
      showToast('Convenzione registrata con ricevuta digitale', 'success');
    } catch (error) {
      showToast(error.message || 'Errore durante registrazione convenzione', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  function downloadDraft() {
    downloadFile('convenzione-draft.txt', agreementText, 'text/plain;charset=utf-8');
  }

  function downloadRecord(record) {
    const payload = JSON.stringify(record, null, 2);
    downloadFile(`ricevuta-${record.id}.json`, payload, 'application/json;charset=utf-8');
  }

  return (
    <section className={styles.page}>
      <Card className={styles.hero}>
        <p className={styles.kicker}>
          <ShieldCheck size={15} aria-hidden="true" /> Generatore convenzioni
        </p>
        <h1>Convenzione con accettazione e prova firma elettronica</h1>
        <p className="muted">
          Compila il modello, registra accettazione termini e salva hash SHA-256 con metadati del certificato.
        </p>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/tutorial')}>
            Tutorial admin
          </Button>
        </div>
      </Card>

      <Card className={styles.formCard}>
        <h2>Dati convenzione</h2>
        <div className={styles.grid}>
          <label>
            Parte A (ragione sociale)
            <input
              value={form.partyAName}
              onChange={(event) => patchForm('partyAName', event.target.value.slice(0, 140))}
              placeholder="Es. Associazione Alfa"
            />
          </label>
          <label>
            Parte A (CF/P.IVA)
            <input
              value={form.partyATaxCode}
              onChange={(event) => patchForm('partyATaxCode', event.target.value.slice(0, 40))}
            />
          </label>
          <label>
            Parte A (sede)
            <input
              value={form.partyAAddress}
              onChange={(event) => patchForm('partyAAddress', event.target.value.slice(0, 200))}
            />
          </label>
          <label>
            Parte B (ragione sociale)
            <input
              value={form.partyBName}
              onChange={(event) => patchForm('partyBName', event.target.value.slice(0, 140))}
              placeholder="Es. Centro Sportivo Beta"
            />
          </label>
          <label>
            Parte B (CF/P.IVA)
            <input
              value={form.partyBTaxCode}
              onChange={(event) => patchForm('partyBTaxCode', event.target.value.slice(0, 40))}
            />
          </label>
          <label>
            Parte B (sede)
            <input
              value={form.partyBAddress}
              onChange={(event) => patchForm('partyBAddress', event.target.value.slice(0, 200))}
            />
          </label>
          <label className={styles.span2}>
            Oggetto della convenzione
            <textarea
              rows={4}
              value={form.objectText}
              onChange={(event) => patchForm('objectText', event.target.value.slice(0, 1200))}
              placeholder="Descrivi attività, servizi e obiettivi della collaborazione"
            />
          </label>
          <label className={styles.span2}>
            Condizioni economiche
            <textarea
              rows={4}
              value={form.economicTerms}
              onChange={(event) => patchForm('economicTerms', event.target.value.slice(0, 1200))}
              placeholder="Es. corrispettivo, fatturazione, pagamenti, penali"
            />
          </label>
          <label>
            Durata (mesi)
            <input
              type="number"
              min="1"
              max="120"
              value={form.durationMonths}
              onChange={(event) => patchForm('durationMonths', Math.max(1, Math.min(120, Number(event.target.value) || 1)))}
            />
          </label>
          <label>
            Legge applicabile
            <input
              value={form.governingLaw}
              onChange={(event) => patchForm('governingLaw', event.target.value.slice(0, 80))}
            />
          </label>
          <label>
            Foro competente
            <input
              value={form.jurisdiction}
              onChange={(event) => patchForm('jurisdiction', event.target.value.slice(0, 120))}
            />
          </label>
        </div>
      </Card>

      <Card className={styles.formCard}>
        <h2>Firma elettronica e accettazione</h2>
        <div className={styles.grid}>
          <label>
            Firmatario
            <input
              value={form.signerName}
              onChange={(event) => patchForm('signerName', event.target.value.slice(0, 120))}
              placeholder="Nome e cognome"
            />
          </label>
          <label>
            Ruolo firmatario
            <input
              value={form.signerRole}
              onChange={(event) => patchForm('signerRole', event.target.value.slice(0, 80))}
              placeholder="Es. Legale rappresentante"
            />
          </label>
          <label>
            Email firmatario
            <input
              type="email"
              value={form.signerEmail}
              onChange={(event) => patchForm('signerEmail', event.target.value.slice(0, 120))}
            />
          </label>
          <label>
            Tipo certificato
            <select value={form.certificateType} onChange={(event) => patchForm('certificateType', event.target.value)}>
              <option value="QES">QES - Firma elettronica qualificata</option>
              <option value="FEA">FEA - Firma elettronica avanzata</option>
              <option value="AES">AES - Firma elettronica avanzata (custom)</option>
            </select>
          </label>
          <label>
            Autorita certificante
            <input
              value={form.certificateAuthority}
              onChange={(event) => patchForm('certificateAuthority', event.target.value.slice(0, 140))}
              placeholder="Es. Qualified Trust Service Provider"
            />
          </label>
          <label>
            Seriale certificato
            <input
              value={form.certificateSerial}
              onChange={(event) => patchForm('certificateSerial', event.target.value.slice(0, 120))}
              placeholder="Numero seriale certificato"
            />
          </label>
          <label>
            Paese emissione
            <input
              value={form.certificateCountry}
              onChange={(event) => patchForm('certificateCountry', event.target.value.slice(0, 60))}
            />
          </label>
        </div>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={form.acceptTerms}
            onChange={(event) => patchForm('acceptTerms', event.target.checked)}
          />
          Dichiaro di aver letto e accettato termini e condizioni della convenzione.
        </label>
        <div className={styles.actions}>
          <Button type="button" variant="secondary" icon={FileText} onClick={downloadDraft}>
            Scarica bozza
          </Button>
          <Button type="button" icon={FileCheck2} onClick={saveAgreement} disabled={isSaving}>
            Registra convenzione firmata
          </Button>
        </div>
      </Card>

      <Card className={styles.previewCard}>
        <h2>Anteprima convenzione</h2>
        <pre className={styles.preview}>{agreementText}</pre>
      </Card>

      <Card className={styles.recordsCard}>
        <h2>Ricevute registrate</h2>
        {!records.length ? (
          <p className="muted">Nessuna convenzione registrata per questo account.</p>
        ) : (
          <div className={styles.stack}>
            {records.map((record) => (
              <article key={record.id} className={styles.record}>
                <p className={styles.recordId}>{record.id}</p>
                <p className="muted">
                  Parti: {record.party_a?.name} / {record.party_b?.name}
                </p>
                <p className="muted">Accettazione: {formatDateTime(record.terms_accepted_at)}</p>
                <p className={styles.hash}>SHA-256: {record.document_hash_sha256}</p>
                <Button type="button" size="sm" variant="secondary" icon={Download} onClick={() => downloadRecord(record)}>
                  Scarica ricevuta JSON
                </Button>
              </article>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

export default ConvenzioneAgreementGeneratorPage;
