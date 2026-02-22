import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Cpu, Sparkles } from 'lucide-react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useToast } from '../context/ToastContext';
import { ai, AI_PROVIDER_MODE, getAiSettings, updateAiSettings } from '../services/ai';
import Card from '../components/Card';
import Button from '../components/Button';
import styles from '../styles/pages/accountAi.module.css';

function AccountAiPage() {
  const { showToast } = useToast();
  const [aiSettings, setAiSettings] = useState(() => getAiSettings());
  const [aiAvailability, setAiAvailability] = useState({ available: false, reason: 'In verifica...' });
  const [aiTestLoading, setAiTestLoading] = useState(false);
  const [aiTestResult, setAiTestResult] = useState('');

  usePageMeta({ title: 'AI Locale | Motrice', description: 'Impostazioni AI locale beta.' });

  useEffect(() => {
    let active = true;
    ai.getAvailability()
      .then((status) => { if (active) setAiAvailability(status); })
      .catch((error) => {
        if (active) setAiAvailability({ available: false, reason: error.message || 'Local provider non disponibile' });
      });
    return () => { active = false; };
  }, [aiSettings.enableLocalAI]);

  function onChangeAiSettings(patch) {
    const next = updateAiSettings(patch);
    setAiSettings(next);
  }

  async function runAiTest() {
    setAiTestLoading(true);
    setAiTestResult('');
    try {
      const result = await ai.generateText({ purpose: 'event_description', prompt: 'Scrivi una descrizione evento in una frase', maxTokens: 36 });
      setAiTestResult(`${result.text} (${result.provider})`);
      showToast('Test AI completato', 'success');
    } catch (error) {
      setAiTestResult(`Errore: ${error.message || 'AI non disponibile'}`);
      showToast(error.message || 'AI non disponibile', 'error');
    } finally {
      setAiTestLoading(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.backRow}>
        <Link to="/account" className={styles.backLink}><ArrowLeft aria-hidden="true" /> Account</Link>
      </div>

      <Card className={styles.aiPanel}>
        <div className={styles.aiPanelHeader}>
          <h2>AI Locale (Beta)</h2>
          <span className={styles.aiStatusPill}>
            <Cpu size={14} aria-hidden="true" />
            {aiAvailability.available ? 'Disponibile' : 'Non disponibile'}
          </span>
        </div>
        <p className="muted">
          Attiva suggerimenti AI in creazione evento e chat. In app mobile nativa usa sempre il provider locale.
        </p>

        <label className={styles.aiToggle}>
          <input
            type="checkbox"
            checked={aiSettings.enableLocalAI}
            onChange={(event) => onChangeAiSettings({ enableLocalAI: event.target.checked })}
            aria-label="Abilita AI Locale beta"
          />
          <span>Abilita AI (Beta)</span>
        </label>

        <label className={styles.aiField}>
          Provider
          <select value={aiSettings.providerMode} onChange={(event) => onChangeAiSettings({ providerMode: event.target.value })}>
            <option value={AI_PROVIDER_MODE.AUTO}>Auto (Locale a Remoto)</option>
            <option value={AI_PROVIDER_MODE.LOCAL}>Solo Locale</option>
          </select>
        </label>

        <div className={styles.aiGrid}>
          <label className={styles.aiField}>
            Model ID
            <input value={aiSettings.modelId} onChange={(event) => onChangeAiSettings({ modelId: event.target.value.slice(0, 60) })} placeholder="motrice-mini-v1" />
          </label>
          <label className={styles.aiField}>
            Model Path
            <input value={aiSettings.modelPath} onChange={(event) => onChangeAiSettings({ modelPath: event.target.value.slice(0, 160) })} placeholder="/models/motrice-mini.gguf" />
          </label>
        </div>
        <p className={styles.aiReason}>Model path opzionale: se vuoto usa il path interno predefinito.</p>

        <p className={styles.aiReason}>
          {aiAvailability.available
            ? 'Runtime locale pronto su dispositivo.'
            : `${aiAvailability.reason || 'Runtime locale non disponibile'}. In web puo usare Auto, in app serve plugin locale.`}
        </p>

        <div className={styles.actions}>
          <Button type="button" icon={Sparkles} onClick={runAiTest} disabled={!aiSettings.enableLocalAI || aiTestLoading}>
            {aiTestLoading ? 'Test in corso...' : 'Test AI'}
          </Button>
        </div>
        {aiTestResult ? <p className={styles.aiTestResult}>{aiTestResult}</p> : null}
      </Card>
    </section>
  );
}

export default AccountAiPage;
