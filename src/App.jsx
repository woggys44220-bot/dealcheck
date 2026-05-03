import { useEffect, useMemo, useState } from 'react';

const categories = ['bijoux', 'meuble', 'électroménager', 'outil', 'pièce auto', 'vêtement', 'téléphone', 'déco', 'jouet', 'sport', 'autre'];
const conditions = ['neuf', 'très bon', 'bon', 'correct', 'abîmé'];
const objectives = ['vendre vite', 'prix équilibré', 'vendre au meilleur prix'];

const conditionCoef = { neuf: 0.85, 'très bon': 0.7, bon: 0.55, correct: 0.4, abîmé: 0.25 };
const easeByCategory = {
  bijoux: 'moyen', meuble: 'moyen', 'électroménager': 'bon', outil: 'bon', 'pièce auto': 'niche', vêtement: 'difficile', téléphone: 'bon mais risqué', déco: 'moyen', jouet: 'moyen', sport: 'bon', autre: 'moyen'
};
const easeScore = { bon: 15, moyen: 5, difficile: -15, niche: -5, 'bon mais risqué': 5 };
const categoryResaleMultiplier = { bijoux: 1.25, meuble: 1.2, 'électroménager': 1.28, outil: 1.32, 'pièce auto': 1.22, vêtement: 1.15, téléphone: 1.27, déco: 1.18, jouet: 1.2, sport: 1.3, autre: 1.2 };
const flipResaleFloorByCategory = { outil: 35, 'électroménager': 45, sport: 35, téléphone: 80, meuble: 40, bijoux: 25, vêtement: 15, déco: 20, jouet: 20, 'pièce auto': 40, autre: 25 };
const flipResaleFloorConditionMultiplier = { neuf: 1.2, 'très bon': 1, bon: 0.85, correct: 0.65, abîmé: 0.4 };
const lotCategories = new Set(['bijoux', 'vêtement', 'jouet', 'déco']);
const lotFriendlyCategories = new Set(['bijoux', 'vêtement', 'jouet', 'déco']);
const lotNameHints = ['lot', 'ensemble', 'paire', 'plusieurs', 'accessoire', 'accessoires'];
const singleDecorKeywords = ['lampe', 'miroir', 'cadre', 'vase', 'table', 'chaise'];
const lowRiskBuyCategories = new Set(['outil', 'jouet', 'déco', 'sport', 'vêtement', 'bijoux']);
const opportunityCategories = ['outil', 'téléphone', 'meuble', 'électroménager', 'bijoux', 'vêtement', 'jouet', 'sport', 'déco', 'pièce auto', 'autre'];
const riskLevels = ['faible', 'moyen', 'élevé'];
const HISTORY_KEY = 'dealcheck_v16_history';
const HISTORY_LIMIT = 50;

const money = (n) => `${(Number.isFinite(n) ? n : 0).toFixed(2)} $`;
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const cleanPrice = (n) => money(Number.isFinite(n) ? n : 0);
const safeText = (value, fallback = '') => {
  const text = typeof value === 'string' ? value : value == null ? '' : String(value);
  const trimmed = text.trim();
  if (!trimmed || ['undefined', 'null', 'nan', '[object object]'].includes(trimmed.toLowerCase())) return fallback;
  return trimmed;
};
const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const safeMoney = (value) => money(safeNumber(value, 0));
const defaultSellingAdviceByCategory = {
  bijoux: 'Vends ce type de bijou en lot si tu en as plusieurs, car la valeur perçue sera meilleure.',
  vêtement: 'Ajoute des photos portées ou sur cintre, et indique la taille clairement.',
  meuble: 'Ajoute les dimensions exactes et une photo de chaque angle.',
  outil: 'Précise si l’objet fonctionne, s’il y a batterie, chargeur ou accessoires.',
  téléphone: 'Indique l’état de la batterie, le stockage, l’opérateur et si le téléphone est déverrouillé.',
  autre: 'Ajoute des photos nettes, le maximum de détails et l’état réel.'
};
const unsafeDescriptionPatterns = [
  /confirmer\s+le\s+mat[ée]riau/i,
  /confirmer\s+les\s+mat[ée]riaux/i,
  /v[ée]rifier?\s+l[’']authenticit[ée]/i,
  /v[ée]rifiez\s+l[’']authenticit[ée]/i,
  /ne\s+garantit\s+pas/i,
  /je\s+ne\s+garantis\s+pas/i,
  /sous\s+r[ée]serve/i,
  /l[’']?[ée]tat\s+exact\s+doit\s+[êe]tre\s+confirm[ée]/i,
  /doit\s+[êe]tre\s+confirm[ée]\s+manuellement/i,
  /avant\s+achat/i
];

function normalizeSellWarning(warning) {
  const rawWarning = String(warning || '').trim();
  if (!rawWarning) return '';
  const lowerWarning = rawWarning.toLowerCase();

  if (lowerWarning.includes("avant l'achat") || lowerWarning.includes('avant achat') || lowerWarning.includes('auprès du vendeur') || lowerWarning.includes('aupres du vendeur')) {
    if (/perles?/i.test(rawWarning) || /mat[ée]riau/i.test(rawWarning) || /marque/i.test(rawWarning)) {
      return 'Ne promets pas une matière ou une marque si ce n’est pas certain.';
    }
    if (/dimensions?/i.test(rawWarning) || /[ée]l[ée]ments? visibles?/i.test(rawWarning)) {
      return 'Confirme les dimensions, l’état et les éléments visibles avant la mise en vente.';
    }
    return 'Vérifie l’état réel et les détails de l’objet avant de publier l’annonce.';
  }

  return rawWarning;
}

function cleanMarketplaceDescription(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const sentences = raw
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const kept = sentences.filter((sentence) => !unsafeDescriptionPatterns.some((pattern) => pattern.test(sentence)));
  if (kept.length === 0) return raw;
  return kept.join(' ').replace(/\s{2,}/g, ' ').trim();
}

function formatCity(city) {
  const trimmedCity = (city || '').trim();
  if (!trimmedCity) return 'votre ville';
  return trimmedCity
    .split(/\s+/)
    .map((word) => word
      .split('-')
      .map((chunk) => chunk ? `${chunk.charAt(0).toUpperCase()}${chunk.slice(1).toLowerCase()}` : chunk)
      .join('-'))
    .join(' ');
}

function getSellDecisionSummary(data) {
  const hasStrongLocalCompetition = data.localCompetitionLevel === 'forte' && Number.isFinite(data.localAveragePrice);
  if (data.decision === 'VENDS EN LOT') return { todo: `Vends en lot autour de ${cleanPrice(data.advised)}.`, why: hasStrongLocalCompetition ? `Concurrence forte et prix moyen local autour de ${cleanPrice(data.localAveragePrice)}.` : 'Catégorie concurrentielle ou valeur perçue meilleure en lot.', action: hasStrongLocalCompetition ? 'Reste proche du marché ou propose un lot pour te démarquer.' : 'Prépare 3 ou 4 objets similaires, belles photos et prix attractif.' };
  if (data.decision === 'VENDS VITE') return { todo: `Mets un prix autour de ${cleanPrice(data.quick)}.`, why: 'Objectif vente rapide.', action: 'Publie avec des photos claires et réponds vite aux messages.' };
  if (data.decision === 'PRIX CORRECT') return { todo: `Publie autour de ${cleanPrice(data.advised)}.`, why: 'Prix cohérent avec l’objet et le marché.', action: 'Teste ce prix, puis baisse légèrement si aucun message.' };
  if (data.decision.includes('ATTENDS')) return { todo: `Teste le prix haut autour de ${cleanPrice(data.high)}.`, why: 'Tu cherches à maximiser le prix.', action: 'Prépare une annonce plus détaillée et accepte d’attendre.' };
  return { todo: `Ajuste ton prix autour de ${cleanPrice(data.advised)}.`, why: 'Le marché demande un positionnement plus compétitif.', action: 'Revois le prix et optimise l’annonce avant de republier.' };
}

function getFlipDecisionSummary(data, category) {
  const hasStrongLocalCompetition = data.localCompetitionLevel === 'forte';
  const isPhone = category === 'téléphone';
  if (data.decision === 'ACHÈTE') return { todo: 'Tu peux acheter si l’état est confirmé.', why: data.ask <= 15 ? 'Prix demandé bas et marge nette positive.' : `Marge nette estimée suffisante : ${cleanPrice(data.net)}.`, action: isPhone ? 'Vérifie IMEI, iCloud, batterie, facture, opérateur et écran.' : 'Vérifie l’état, les accessoires et récupère rapidement.' };
  if (data.decision === 'NÉGOCIE') return { todo: `Négocie autour de ${cleanPrice(Number.isFinite(data.suggestedOffer) ? data.suggestedOffer : 0)}.`, why: hasStrongLocalCompetition ? 'La marge est limite au prix actuel. Concurrence locale forte.' : 'La marge est limite au prix actuel.', action: isPhone ? 'Vérifie IMEI, iCloud, batterie, facture, opérateur et écran.' : hasStrongLocalCompetition ? 'Négocie plus bas ou cherche une annonce moins concurrencée.' : 'Envoie le message de négociation et n’achète pas au prix affiché.' };
  return { todo: 'Évite ce deal.', why: 'Marge nette insuffisante ou risque trop élevé.', action: 'Passe à une autre annonce, sauf très forte baisse du vendeur.' };
}

function App() {
  const [mode, setMode] = useState('home');
  const [historyEntries, setHistoryEntries] = useState(() => loadHistory());
  const addHistoryEntry = (entry) => {
    setHistoryEntries((prev) => {
      const next = [entry, ...prev].slice(0, HISTORY_LIMIT);
      saveHistory(next);
      return next;
    });
  };
  const deleteHistoryEntry = (id) => setHistoryEntries((prev) => {
    const next = prev.filter((item) => item.id !== id);
    saveHistory(next);
    return next;
  });
  const clearHistory = () => setHistoryEntries(() => {
    saveHistory([]);
    return [];
  });
  return (
    <main className="app">
      <section className="card">
        {mode === 'home' && <Home setMode={setMode} />}
        {mode === 'sell' && <SellMode onBack={() => setMode('home')} onSaveHistory={addHistoryEntry} />}
        {mode === 'flip' && <FlipMode onBack={() => setMode('home')} onSaveHistory={addHistoryEntry} />}
        {mode === 'opportunities' && <OpportunityMode onBack={() => setMode('home')} onSaveHistory={addHistoryEntry} />}
        {mode === 'history' && <HistoryMode entries={historyEntries} onBack={() => setMode('home')} onDelete={deleteHistoryEntry} onClear={clearHistory} />}
      </section>
    </main>
  );
}

function Home({ setMode }) {
  return <>
    <h1>DealCheck</h1><p className="tag">Acheter, vendre ou laisser tomber.</p>
    <p className="intro">Analyse un objet en quelques secondes pour savoir s’il vaut le coup d’être vendu, acheté ou négocié.</p>
    <div className="actions">
      <button className="primary" onClick={() => setMode('sell')}>Je veux vendre</button>
      <button className="secondary" onClick={() => setMode('flip')}>Je veux acheter pour revendre</button>
      <button className="secondary" onClick={() => setMode('opportunities')}>Je cherche quoi acheter-revendre ?</button>
      <button className="secondary" onClick={() => setMode('history')}>Historique</button>
    </div>
  </>;
}

function SellMode({ onBack, onSaveHistory }) {
  const [form, setForm] = useState({ name: '', category: categories[0], condition: conditions[1], value: '', city: '', objective: objectives[0], localCount: '', localLow: '', localAvg: '', localHigh: '' });
  const [copiedMessage, setCopiedMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [hasResult, setHasResult] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [selectedAiDescription, setSelectedAiDescription] = useState('');
  const [selectedAiSellingTitle, setSelectedAiSellingTitle] = useState('');
  const [selectedTitleType, setSelectedTitleType] = useState('selling');
  const [selectedDescriptionType, setSelectedDescriptionType] = useState('detailed');
  const [selectedAiPhotoTips, setSelectedAiPhotoTips] = useState([]);
  const [selectedAiSellingAdvice, setSelectedAiSellingAdvice] = useState('');
  const [selectedAiWarning, setSelectedAiWarning] = useState('');
  const data = useMemo(
    () => computeSell(form, Boolean(photoPreview), selectedAiDescription, selectedAiSellingTitle, selectedAiPhotoTips, selectedAiSellingAdvice, selectedAiWarning),
    [form, photoPreview, selectedAiDescription, selectedAiSellingTitle, selectedAiPhotoTips, selectedAiSellingAdvice, selectedAiWarning]
  );

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const updateSellField = (field, value) => {
    setForm({ ...form, [field]: value });
    setHasResult(false);
  };

  const validateSellForm = () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Indique le nom de l’objet.';
    const value = Number(form.value);
    if (!form.value || !Number.isFinite(value) || value <= 0) {
      nextErrors.value = 'Indique une valeur estimée valide.';
    }
    const localCount = Number(form.localCount);
    const localLow = Number(form.localLow);
    const localAvg = Number(form.localAvg);
    const localHigh = Number(form.localHigh);
    const hasLocalLow = form.localLow !== '';
    const hasLocalAvg = form.localAvg !== '';
    const hasLocalHigh = form.localHigh !== '';
    if (form.localCount !== '' && (!Number.isFinite(localCount) || localCount < 0)) { nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.'; nextErrors.amounts = 'Les montants doivent être supérieurs ou égaux à 0.'; }
    if (hasLocalLow && (!Number.isFinite(localLow) || localLow < 0)) { nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.'; nextErrors.amounts = 'Les montants doivent être supérieurs ou égaux à 0.'; }
    if (hasLocalAvg && (!Number.isFinite(localAvg) || localAvg < 0)) { nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.'; nextErrors.amounts = 'Les montants doivent être supérieurs ou égaux à 0.'; }
    if (hasLocalHigh && (!Number.isFinite(localHigh) || localHigh < 0)) { nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.'; nextErrors.amounts = 'Les montants doivent être supérieurs ou égaux à 0.'; }
    if (hasLocalLow && hasLocalAvg && localLow > localAvg) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    if (hasLocalAvg && hasLocalHigh && localAvg > localHigh) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const analyzeSell = () => {
    if (!validateSellForm()) return;
    setHasResult(true);
    onSaveHistory(buildSellHistoryEntry(form, data, Boolean(photoPreview)));
  };

  const resetSellForm = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview('');
    setPhotoFile(null);
    setPhotoError('');
    setAiError('');
    setAiSuggestion(null);
    setSelectedAiDescription('');
    setSelectedAiSellingTitle('');
    setSelectedTitleType('selling');
    setSelectedDescriptionType('detailed');
    setSelectedAiPhotoTips([]);
    setSelectedAiSellingAdvice('');
    setSelectedAiWarning('');
    setAiLoading(false);
    setCopiedMessage('');
    setForm({ name: '', category: categories[0], condition: conditions[1], value: '', city: '', objective: objectives[0], localCount: '', localLow: '', localAvg: '', localHigh: '' });
    setErrors({});
    setHasResult(false);
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Merci d’ajouter une image valide.');
      event.target.value = '';
      return;
    }
    setPhotoError('');
    const nextPreview = URL.createObjectURL(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(nextPreview);
    setPhotoFile(file);
    setAiError('');
    setAiSuggestion(null);
    setSelectedAiDescription('');
    setSelectedAiSellingTitle('');
    setSelectedTitleType('selling');
    setSelectedDescriptionType('detailed');
    setSelectedAiPhotoTips([]);
    setSelectedAiSellingAdvice('');
    setSelectedAiWarning('');
    setCopiedMessage('');
    setHasResult(false);
  };

  const removePhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview('');
    setPhotoFile(null);
    setPhotoError('');
    setAiError('');
    setAiSuggestion(null);
    setSelectedAiDescription('');
    setSelectedAiSellingTitle('');
    setSelectedTitleType('selling');
    setSelectedDescriptionType('detailed');
    setSelectedAiPhotoTips([]);
    setSelectedAiSellingAdvice('');
    setSelectedAiWarning('');
    setAiLoading(false);
    setCopiedMessage('');
    setHasResult(false);
  };

  const analyzePhoto = async () => {
    if (!photoFile) return;
    setAiLoading(true);
    setAiError('');
    setAiSuggestion(null);
    try {
      const body = new FormData();
      body.append('photo', photoFile);
      console.log('Analyse photo: appel backend démarré');
      const response = await fetch('/api/analyze-photo', { method: 'POST', body });
      console.log('Analyse photo: status HTTP', response.status);
      const result = await response.json();
      console.log('Analyse photo: réponse JSON', result);
      if (!response.ok) throw new Error(`api_${response.status}`);
      setAiSuggestion(result);
    } catch (error) {
      console.error('Analyse photo: erreur fetch complète', error);
      setAiError('Impossible d’analyser la photo pour le moment. Tu peux continuer manuellement.');
    } finally {
      setAiLoading(false);
    }
  };



  const getChosenTitle = (suggestion) => {
    if (!suggestion) return '';
    const shortTitle = (suggestion.shortTitle || '').trim();
    const sellingTitle = (suggestion.sellingTitle || '').trim();
    if (selectedTitleType === 'short') return shortTitle || sellingTitle;
    return sellingTitle || shortTitle;
  };

  const getChosenDescription = (suggestion) => {
    if (!suggestion) return '';
    const shortDescription = (suggestion.shortDescription || '').trim();
    const detailedDescription = (suggestion.detailedDescription || suggestion.description || '').trim();
    if (selectedDescriptionType === 'short') return cleanMarketplaceDescription(shortDescription || detailedDescription);
    return cleanMarketplaceDescription(detailedDescription || shortDescription);
  };

  const useSuggestions = () => {
    if (!aiSuggestion) return;
    setForm((prev) => ({
      ...prev,
      name: aiSuggestion.objectName || prev.name,
      category: categories.includes(aiSuggestion.category) ? aiSuggestion.category : prev.category,
      condition: conditions.includes(aiSuggestion.condition) ? aiSuggestion.condition : prev.condition
    }));
    setSelectedAiDescription(getChosenDescription(aiSuggestion));
    setSelectedAiSellingTitle(getChosenTitle(aiSuggestion));
    setSelectedAiPhotoTips(Array.isArray(aiSuggestion.photoTips) ? aiSuggestion.photoTips.map((tip) => String(tip)).filter(Boolean) : []);
    setSelectedAiSellingAdvice((aiSuggestion.sellingAdvice || '').trim());
    setSelectedAiWarning((aiSuggestion.warning || '').trim());
    setHasResult(false);
  };

  const showResult = hasResult;
  const showPhotoTipsCopyButton = Array.isArray(data.aiPhotoTips) && data.aiPhotoTips.length > 0;
  const copyText = async (text, successMessage) => {
    if (!showResult) return;
    const cleanedText = safeText(text, '');
    if (!cleanedText) return;
    await navigator.clipboard.writeText(cleanedText);
    setCopiedMessage(successMessage);
    setTimeout(() => setCopiedMessage(''), 2200);
  };

  const copyTitle = async () => copyText(data.title, 'Titre copié ✅');
  const copyDescription = async () => copyText(data.description, 'Description copiée ✅');
  const copyFullAd = async () => {
    const title = typeof data.title === 'string' ? data.title : '';
    const description = typeof data.description === 'string' ? data.description : '';
    const hasAdvisedPrice = Number.isFinite(data.advised);
    const sections = [];
    if (title.trim()) sections.push(`Titre :\n${title}`);
    if (hasAdvisedPrice) sections.push(`Prix conseillé :\n${money(data.advised)}`);
    if (description.trim()) sections.push(`Description :\n${description}`);
    const fullAd = sections.join('\n\n') || 'Annonce non disponible';
    try {
      await copyText(fullAd, 'Annonce complète copiée');
    } catch (error) {
      setCopiedMessage('Impossible de copier l’annonce complète');
      setTimeout(() => setCopiedMessage(''), 2200);
    }
  };
  const copyPhotoTips = async () => {
    const tips = Array.isArray(data.aiPhotoTips) ? data.aiPhotoTips.map((tip) => (tip || '').trim()).filter(Boolean) : [];
    await copyText(tips.join('\n'), 'Conseils copiés ✅');
  };
  return <div>
    <Header title="Mode vente" onBack={onBack} />
    <section className="photo-block">
      <h3>Photo de l’objet</h3>
      <p className="field-hint">Optionnel : ajoute une photo pour préparer ton annonce. La reconnaissance automatique viendra dans une prochaine version.</p>
      <label className={photoError ? 'field-error' : ''}>
        Importer une photo
        <input type="file" accept="image/jpg,image/jpeg,image/png,image/webp" onChange={handlePhotoChange} />
        {photoError && <span className="field-error-text">{photoError}</span>}
      </label>
      {photoPreview && (
        <div className="photo-preview-card">
          <img src={photoPreview} alt="Aperçu de l’objet" className="photo-preview" />
          <button type="button" onClick={removePhoto}>Supprimer la photo</button>
        </div>
      )}
      {photoPreview && <p className="photo-note">Photo ajoutée. Pour l’instant, vérifie toi-même le nom, la catégorie et l’état.</p>}
    </section>

    <section className="photo-ai-block">
      <h3>Analyse photo IA</h3>
      <p className="field-hint">Optionnel : l’IA propose un nom, une catégorie, un état apparent et une description. Vérifie toujours manuellement avant publication.</p>
      {photoFile && !aiLoading && <button type="button" onClick={analyzePhoto}>Analyser la photo</button>}
      {aiLoading && <p className="photo-note">Analyse en cours…</p>}
      {aiError && <p className="form-error">{aiError}</p>}
      {aiSuggestion && (
        <article className="ai-suggestion">
          <h4>Suggestion IA</h4>

          <section className="ai-section ai-summary">
            <p className="ai-section-title"><strong>Résumé IA</strong></p>
            <p><strong>Objet détecté :</strong> {aiSuggestion.objectName}</p>
            <p><strong>Catégorie proposée :</strong> {aiSuggestion.category}</p>
            <p><strong>État apparent :</strong> {aiSuggestion.condition}</p>
            <p><strong>Confiance :</strong> {aiSuggestion.confidence}</p>
          </section>

          <section className="ai-section ai-choices">
            <p className="ai-section-title"><strong>Choix de l’annonce</strong></p>
            <p className="field-hint">Tu peux choisir une version courte ou plus vendeuse avant de générer l’annonce.</p>
            {(aiSuggestion.shortTitle || aiSuggestion.sellingTitle) && <div className="choice-group">
              <p><strong>Choisir le titre à utiliser</strong></p>
              <div className="choice-options">
                {aiSuggestion.shortTitle && <button type="button" className={`choice-option ${selectedTitleType === 'short' ? 'selected' : ''}`} onClick={() => setSelectedTitleType('short')}>Titre court</button>}
                {aiSuggestion.sellingTitle && <button type="button" className={`choice-option ${selectedTitleType === 'selling' ? 'selected' : ''}`} onClick={() => setSelectedTitleType('selling')}>Titre vendeur</button>}
              </div>
            </div>}
            {(aiSuggestion.shortDescription || aiSuggestion.detailedDescription || aiSuggestion.description) && <div className="choice-group">
              <p><strong>Choisir la description à utiliser</strong></p>
              <div className="choice-options">
                {aiSuggestion.shortDescription && <button type="button" className={`choice-option ${selectedDescriptionType === 'short' ? 'selected' : ''}`} onClick={() => setSelectedDescriptionType('short')}>Description courte</button>}
                {(aiSuggestion.detailedDescription || aiSuggestion.description) && <button type="button" className={`choice-option ${selectedDescriptionType === 'detailed' ? 'selected' : ''}`} onClick={() => setSelectedDescriptionType('detailed')}>Description détaillée</button>}
              </div>
            </div>}
          </section>

          <details className="ai-section ai-details">
            <summary><strong>Voir les détails IA</strong></summary>
            <div className="ai-details-content">
              <p className="ai-section-title"><strong>Détails IA</strong></p>
              <p><strong>Mots-clés :</strong> {Array.isArray(aiSuggestion.keywords) ? aiSuggestion.keywords.join(', ') : ''}</p>
              <p><strong>Description proposée :</strong> {aiSuggestion.description}</p>
              <p><strong>Titre court :</strong> {aiSuggestion.shortTitle || '—'}</p>
              <p><strong>Titre vendeur :</strong> {aiSuggestion.sellingTitle || '—'}</p>
              <p><strong>Description courte :</strong> {aiSuggestion.shortDescription || '—'}</p>
              <p><strong>Description détaillée :</strong> {aiSuggestion.detailedDescription || '—'}</p>
              <div><strong>Conseils photo :</strong>{Array.isArray(aiSuggestion.photoTips) && aiSuggestion.photoTips.length > 0 ? <ul>{aiSuggestion.photoTips.map((tip, index) => <li key={`${tip}-${index}`}>{tip}</li>)}</ul> : <span> —</span>}</div>
              <p><strong>Conseil de mise en vente :</strong> {aiSuggestion.sellingAdvice || '—'}</p>
              <p><strong>Avertissement :</strong> {aiSuggestion.warning}</p>
            </div>
          </details>

          <button type="button" onClick={useSuggestions}>Utiliser ces suggestions</button>
        </article>
      )}
    </section>

    <FormField label="Nom de l’objet" error={errors.name} invalid={!!errors.name}><input value={form.name} onChange={(e)=>{updateSellField('name', e.target.value); if (errors.name) setErrors({...errors,name:undefined});}}/></FormField>
    <FormField label="Catégorie"><select value={form.category} onChange={(e)=>updateSellField('category', e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></FormField>
    <FormField label="État"><select value={form.condition} onChange={(e)=>updateSellField('condition', e.target.value)}>{conditions.map(c=><option key={c}>{c}</option>)}</select></FormField>
    <FormField label="Valeur estimée / prix d’achat initial" error={errors.value} invalid={!!errors.value}><input type="number" min="0" value={form.value} onChange={(e)=>{updateSellField('value', e.target.value); if (errors.value) setErrors({...errors,value:undefined});}}/></FormField>
    <FormField label="Ville / région" error={errors.city} invalid={!!errors.city}><input value={form.city} onChange={(e)=>{updateSellField('city', e.target.value); if (errors.city) setErrors({...errors,city:undefined});}}/></FormField>
    <FormField label="Objectif"><select value={form.objective} onChange={(e)=>updateSellField('objective', e.target.value)}>{objectives.map(o=><option key={o}>{o}</option>)}</select></FormField>
    <section>
      <h3>Concurrence locale</h3>
      <p className="field-hint">Optionnel : indique ce que tu vois sur les annonces similaires pour ajuster ton prix de vente.</p>
      <FormField label="Nombre d’annonces similaires" invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localCount} onChange={(e)=>{updateSellField('localCount', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      <FormField label="Prix le plus bas observé" invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localLow} onChange={(e)=>{updateSellField('localLow', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      <FormField label="Prix moyen observé" invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localAvg} onChange={(e)=>{updateSellField('localAvg', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      <FormField label="Prix le plus haut observé" invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localHigh} onChange={(e)=>{updateSellField('localHigh', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      {errors.localCompetition && <p className="form-error">{errors.localCompetition}</p>}
    </section>
    {errors.amounts && <p className="form-error">{errors.amounts}</p>}
    {(errors.form || errors.name || errors.value || errors.city) && <p className="form-error">Merci de remplir les champs obligatoires avant l’analyse.</p>}
    <div className="actions"><button className="primary" onClick={analyzeSell}>Analyser mon objet</button></div>
    {showResult && <SellResult data={data} actions={{ copyTitle, copyDescription, copyFullAd, copyPhotoTips, resetSellForm, showPhotoTipsCopyButton }} />}
    {copiedMessage && <p className="copied">{copiedMessage}</p>}
  </div>;
}

function FlipMode({ onBack, onSaveHistory }) {
  const [form, setForm] = useState({ name:'', category:categories[0], condition:conditions[1], ask:'', costs:'', hours:'', city:'', minMargin:'', localCount:'', localLow:'', localAvg:'', localHigh:'' });
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState({});
  const [hasResult, setHasResult] = useState(false);
  const data = useMemo(()=>computeFlip(form), [form]);

  const updateFlipField = (field, value) => {
    setForm({ ...form, [field]: value });
    setHasResult(false);
  };

  const validateFlipForm = () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Indique le nom de l’objet.';
    const ask = Number(form.ask);
    if (!form.ask || !Number.isFinite(ask) || ask <= 0) nextErrors.ask = 'Merci de remplir les champs obligatoires avant l’analyse.';
    const minMargin = Number(form.minMargin);
    if (form.minMargin === '' || !Number.isFinite(minMargin) || minMargin < 0) nextErrors.minMargin = 'Merci de remplir les champs obligatoires avant l’analyse.';
    if (ask < 0 || minMargin < 0) nextErrors.amounts = 'Les montants doivent être supérieurs ou égaux à 0.';
    const costs = Number(form.costs);
    if (form.costs !== '' && (!Number.isFinite(costs) || costs < 0)) { nextErrors.costs = 'Merci de remplir les champs obligatoires avant l’analyse.'; nextErrors.amounts = 'Les montants doivent être supérieurs ou égaux à 0.'; }
    const hours = Number(form.hours);
    if (form.hours !== '' && (!Number.isFinite(hours) || hours < 0)) { nextErrors.hours = 'Merci de remplir les champs obligatoires avant l’analyse.'; nextErrors.amounts = 'Les montants doivent être supérieurs ou égaux à 0.'; }
    const localCount = Number(form.localCount);
    const localLow = Number(form.localLow);
    const localAvg = Number(form.localAvg);
    const localHigh = Number(form.localHigh);
    const hasLocalLow = form.localLow !== '';
    const hasLocalAvg = form.localAvg !== '';
    const hasLocalHigh = form.localHigh !== '';
    if (form.localCount !== '' && (!Number.isFinite(localCount) || localCount < 0)) { nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.'; nextErrors.amounts = 'Les montants doivent être supérieurs ou égaux à 0.'; }
    if (hasLocalLow && (!Number.isFinite(localLow) || localLow < 0)) { nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.'; nextErrors.amounts = 'Les montants doivent être supérieurs ou égaux à 0.'; }
    if (hasLocalAvg && (!Number.isFinite(localAvg) || localAvg < 0)) { nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.'; nextErrors.amounts = 'Les montants doivent être supérieurs ou égaux à 0.'; }
    if (hasLocalHigh && (!Number.isFinite(localHigh) || localHigh < 0)) { nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.'; nextErrors.amounts = 'Les montants doivent être supérieurs ou égaux à 0.'; }
    if (hasLocalLow && hasLocalAvg && localLow > localAvg) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    if (hasLocalAvg && hasLocalHigh && localAvg > localHigh) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const analyzeFlip = () => {
    if (!validateFlipForm()) return;
    setHasResult(true);
    onSaveHistory(buildFlipHistoryEntry(form, data));
  };

  const showResult = hasResult;
  const copy = async ()=>{ if (!showResult) return; await navigator.clipboard.writeText(data.negotiationMessage); setCopied(true); setTimeout(()=>setCopied(false), 1400); };
  return <div>
    <Header title="Mode achat-revente" onBack={onBack} />
    <FormField label="Nom de l’objet" error={errors.name} invalid={!!errors.name}><input value={form.name} onChange={(e)=>{updateFlipField('name', e.target.value); if (errors.name) setErrors({...errors,name:undefined});}}/></FormField>
    <FormField label="Catégorie"><select value={form.category} onChange={(e)=>updateFlipField('category', e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></FormField>
    <FormField label="État"><select value={form.condition} onChange={(e)=>updateFlipField('condition', e.target.value)}>{conditions.map(c=><option key={c}>{c}</option>)}</select></FormField>
    <FormField label="Prix demandé" error={errors.ask} invalid={!!errors.ask}><input type="number" min="0" value={form.ask} onChange={(e)=>{updateFlipField('ask', e.target.value); if (errors.ask) setErrors({...errors,ask:undefined});}}/></FormField>
    <FormField label="Frais estimés" hint="Essence, livraison, nettoyage, petite réparation ou autres frais liés à l’objet." error={errors.costs} invalid={!!errors.costs}><input type="number" min="0" value={form.costs} onChange={(e)=>{updateFlipField('costs', e.target.value); if (errors.costs) setErrors({...errors,costs:undefined});}}/></FormField>
    <FormField label="Temps estimé (heures)" hint="Temps pour aller chercher, nettoyer, publier l’annonce et vendre l’objet." error={errors.hours} invalid={!!errors.hours}><input type="number" min="0" value={form.hours} onChange={(e)=>{updateFlipField('hours', e.target.value); if (errors.hours) setErrors({...errors,hours:undefined});}}/></FormField>
    <FormField label="Ville / région" error={errors.city} invalid={!!errors.city}><input value={form.city} onChange={(e)=>{updateFlipField('city', e.target.value); if (errors.city) setErrors({...errors,city:undefined});}}/></FormField>
    <FormField label="Marge minimum souhaitée" error={errors.minMargin} invalid={!!errors.minMargin}><input type="number" min="0" value={form.minMargin} onChange={(e)=>{updateFlipField('minMargin', e.target.value); if (errors.minMargin) setErrors({...errors,minMargin:undefined});}}/></FormField>
    <section>
      <h3>Concurrence locale</h3>
      <p className="field-hint">Optionnel : indique ce que tu vois sur les annonces similaires autour de toi pour affiner le verdict.</p>
      <FormField label="Nombre d’annonces similaires" invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localCount} onChange={(e)=>{updateFlipField('localCount', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      <FormField label="Prix le plus bas constaté" invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localLow} onChange={(e)=>{updateFlipField('localLow', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      <FormField label="Prix moyen constaté" invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localAvg} onChange={(e)=>{updateFlipField('localAvg', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      <FormField label="Prix le plus haut constaté" invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localHigh} onChange={(e)=>{updateFlipField('localHigh', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      {errors.localCompetition && <p className="form-error">{errors.localCompetition}</p>}
    </section>
    {errors.amounts && <p className="form-error">{errors.amounts}</p>}
    {Object.keys(errors).some((key) => key !== 'amounts') && <p className="form-error">Merci de remplir les champs obligatoires avant l’analyse.</p>}
    <div className="actions"><button className="primary" onClick={analyzeFlip}>Analyser le deal</button></div>
    {showResult && <FlipResult data={data} category={form.category} actions={{ copy, reset: ()=>{setForm({ name:'', category:categories[0], condition:conditions[1], ask:'', costs:'', hours:'', city:'', minMargin:'', localCount:'', localLow:'', localAvg:'', localHigh:'' }); setErrors({}); setHasResult(false);} }} />}
    {copied && <p className="copied">Message copié ✅</p>}
  </div>;
}

function OpportunityMode({ onBack, onSaveHistory }) {
  const [form, setForm] = useState({ category: 'outil', budget: '', city: '', hours: '', minMargin: '', risk: 'faible' });
  const [errors, setErrors] = useState({});
  const [hasResult, setHasResult] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState('');
  const data = useMemo(() => computeOpportunities(form), [form]);
  const updateField = (field, value) => { setForm({ ...form, [field]: value }); setHasResult(false); };
  const validate = () => {
    const next = {};
    ['budget', 'hours', 'minMargin'].forEach((field) => {
      if (form[field] !== '' && (!Number.isFinite(Number(form[field])) || Number(form[field]) < 0)) next[field] = 'Valeur invalide (>= 0).';
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const analyze = () => { if (!validate()) return; setHasResult(true); onSaveHistory(buildOpportunityHistoryEntry(form, data)); };
  const reset = () => { setForm({ category: 'outil', budget: '', city: '', hours: '', minMargin: '', risk: 'faible' }); setErrors({}); setHasResult(false); setCopiedMessage(''); };
  return <div>
    <Header title="Recherche d’opportunités" onBack={onBack} />
    <FormField label="Catégorie ciblée"><select value={form.category} onChange={(e) => updateField('category', e.target.value)}>{opportunityCategories.map((c) => <option key={c}>{c}</option>)}</select></FormField>
    <FormField label="Budget maximum" error={errors.budget} invalid={!!errors.budget}><input type="number" min="0" value={form.budget} onChange={(e) => updateField('budget', e.target.value)} /></FormField>
    <FormField label="Ville / région"><input value={form.city} onChange={(e) => updateField('city', e.target.value)} /></FormField>
    <FormField label="Temps disponible max par deal en heures" error={errors.hours} invalid={!!errors.hours}><input type="number" min="0" value={form.hours} onChange={(e) => updateField('hours', e.target.value)} /></FormField>
    <FormField label="Marge minimum souhaitée" error={errors.minMargin} invalid={!!errors.minMargin}><input type="number" min="0" value={form.minMargin} onChange={(e) => updateField('minMargin', e.target.value)} /></FormField>
    <FormField label="Niveau de risque accepté"><select value={form.risk} onChange={(e) => updateField('risk', e.target.value)}>{riskLevels.map((r) => <option key={r}>{r}</option>)}</select></FormField>
    <div className="actions"><button className="primary" onClick={analyze}>Trouver des idées</button></div>
    {hasResult && <OpportunityResult data={data} onReset={reset} onCopied={setCopiedMessage} />}
    {copiedMessage && <p className="copied">{copiedMessage} ✅</p>}
  </div>;
}

function OpportunityResult({ data, onReset, onCopied }) {
  const sanitizeList = (values = []) => values.map((value) => safeText(value, '')).filter(Boolean);
  const objects = sanitizeList(data.items);
  const keywords = sanitizeList(data.keywords);
  const positives = sanitizeList(data.positiveSignals);
  const dangers = sanitizeList(data.dangerSignals);
  const safePlan = safeText(data.plan, '');
  const safeTodo = safeText(data.summary?.todo, '');
  const safeWhy = safeText(data.summary?.why, '');
  const safeAction = safeText(data.summary?.action, '');
  const copyText = async (text, successMessage) => {
    const payload = safeText(text, '');
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      onCopied(successMessage);
      setTimeout(() => onCopied(''), 2500);
    } catch (_error) {
      onCopied('');
    }
  };
  const copySummary = () => {
    const sections = [];
    sections.push('Résumé décision :');
    if (safeTodo) sections.push(`À chercher en priorité : ${safeTodo}`);
    if (safeWhy) sections.push(`Pourquoi : ${safeWhy}`);
    if (safeAction) sections.push(`Action concrète : ${safeAction}`);
    if (objects.length) {
      sections.push('', 'Objets recommandés :', ...objects.map((item) => `- ${item}`));
    }
    sections.push('', 'Prix d’achat cible :', `Achat idéal bas : ${safeMoney(data.priceRange?.low)}`, `Achat cible haut : ${safeMoney(data.priceRange?.targetHigh)}`, `Prix max conseillé : ${safeMoney(data.priceRange?.max)}`);
    if (keywords.length) sections.push('', 'Recherches Marketplace :', ...keywords.map((word) => `- ${word}`));
    if (positives.length) sections.push('', 'Signaux positifs :', ...positives.map((signal) => `- ${signal}`));
    if (dangers.length) sections.push('', 'Signaux de danger :', ...dangers.map((signal) => `- ${signal}`));
    if (safePlan) sections.push('', 'Plan d’action :', safePlan);
    copyText(sections.join('\n'), 'Résumé copié');
  };
  return <article className="result">
    <h3>Résumé décision</h3>
    <p><strong>À chercher en priorité :</strong> {safeText(data.summary.todo, 'N/A')}</p>
    <p><strong>Pourquoi :</strong> {safeText(data.summary.why, 'N/A')}</p>
    <p><strong>Action concrète :</strong> {safeText(data.summary.action, 'N/A')}</p>
    <h3>Objets recommandés</h3>
    <ul>{objects.map((item) => <li key={item}>{item}</li>)}</ul>
    <p>{safeText(data.categoryTip, '')}</p>
    <h3>Prix d’achat cible</h3>
    <p>Achat idéal bas : <strong>{money(data.priceRange.low)}</strong> | Achat cible haut : <strong>{money(data.priceRange.targetHigh)}</strong> | Prix max conseillé : <strong>{money(data.priceRange.max)}</strong></p>
    <h3>Stratégie de recherche Marketplace</h3>
    <ul>{keywords.map((word) => <li key={word}>{word}</li>)}</ul>
    <h3>Signaux positifs</h3>
    <ul>{positives.map((s) => <li key={s}>{s}</li>)}</ul>
    <h3>Signaux de danger</h3>
    <ul>{dangers.map((s) => <li key={s}>{s}</li>)}</ul>
    <h3>Plan d’action court</h3>
    <p>{safePlan}</p>
    <section className="result-section">
      <p className="result-section-title">Actions</p>
      <div className="actions">
        <button className="secondary" onClick={() => copyText(keywords.join('\n'), 'Recherches copiées')}>Copier les recherches</button>
        <button className="secondary" onClick={() => copyText(objects.join('\n'), 'Objets copiés')}>Copier les objets</button>
        <button className="secondary" onClick={() => copyText(safePlan, 'Plan copié')}>Copier le plan</button>
        <button className="primary" onClick={copySummary}>Copier le résumé complet</button>
        <button onClick={onReset}>Recommencer</button>
      </div>
    </section>
  </article>;
}

const Header = ({ title, onBack }) => <div className="header"><button onClick={onBack}>← Retour accueil</button><h2>{title}</h2></div>;
const FormField = ({ label, hint, children, error, invalid }) => <label className={invalid ? 'field-error' : ''}>{label}{hint && <span className="field-hint">{hint}</span>}{children}{error && <span className="field-error-text">{error}</span>}</label>;


function isLotFriendlySellContext(category, itemName = '') {
  const normalizedName = safeText(itemName).toLowerCase();
  const hasLotHint = lotNameHints.some((hint) => normalizedName.includes(hint));
  const isSingleDecor = category === 'déco' && singleDecorKeywords.some((keyword) => normalizedName.includes(keyword));
  if (hasLotHint) return true;
  if (!lotFriendlyCategories.has(category)) return false;
  if (isSingleDecor) return false;
  return true;
}

function computeSell(form, hasPhoto = false, aiDescription = '', aiSellingTitle = '', aiPhotoTips = [], aiSellingAdvice = '', aiWarning = '') {
  const base = Number(form.value) || 0;
  const coef = conditionCoef[form.condition];
  const localCount = form.localCount === '' ? null : Number(form.localCount);
  const localLow = form.localLow === '' ? null : Number(form.localLow);
  const localAvg = form.localAvg === '' ? null : Number(form.localAvg);
  const localHigh = form.localHigh === '' ? null : Number(form.localHigh);
  let advised = base * coef;
  let quick = advised * 0.8;
  let high = advised * 1.25;
  const ease = easeByCategory[form.category];
  const isLotFriendly = isLotFriendlySellContext(form.category, form.name);

  let score = 50 + (coef * 35) + easeScore[ease];
  let marketRecommendation = 'Concurrence non renseignée : utilise les prix proposés et ajuste selon les retours.';

  if (form.objective === 'vendre vite') score += 3;
  if (form.objective === 'vendre au meilleur prix') score -= 2;

  const crowdedCategoryPenalty = isLotFriendly ? 10 : 0;
  score -= crowdedCategoryPenalty;

  if (form.objective === 'vendre vite' && isLotFriendly) score -= 3;

  let localCompetitionLevel = 'non renseignée';
  if (Number.isFinite(localCount)) {
    if (localCount <= 5) {
      localCompetitionLevel = 'faible';
      score += 3;
      marketRecommendation = 'Concurrence faible : tu peux tester le prix conseillé ou légèrement plus haut.';
    } else if (localCount <= 20) {
      localCompetitionLevel = 'moyenne';
      marketRecommendation = 'Concurrence moyenne : reste proche du prix moyen local.';
    } else {
      localCompetitionLevel = 'forte';
      score -= 6;
      marketRecommendation = isLotFriendly
        ? 'Concurrence forte : prix attractif, bonnes photos et vente en lot recommandés.'
        : 'Concurrence forte : prix attractif, bonnes photos et titre plus précis recommandés.';
    }
  }

  if (Number.isFinite(localAvg) && localAvg > 0) {
    const ratioToLocalAvg = advised / localAvg;
    if (localCompetitionLevel === 'forte') {
      if (form.objective === 'vendre vite') {
        advised = Math.min(advised, localAvg * 1.02);
        quick = Number.isFinite(localLow) && localLow > 0
          ? Math.max(localLow, localAvg * 0.8)
          : localAvg * 0.8;
      } else {
        advised = Math.min(advised, localAvg * 1.08);
        quick = Math.min(quick, localAvg * 0.85);
      }
      high = Number.isFinite(localHigh) && localHigh > 0
        ? Math.min(Math.max(advised * 1.2, localAvg * 1.1), localHigh)
        : Math.min(Math.max(advised, localAvg * 1.05), localAvg * 1.15);
      score -= 6;
      marketRecommendation = isLotFriendly
        ? 'Concurrence forte : vise un prix proche du marché, ajoute de bonnes photos ou propose un lot pour te démarquer.'
        : 'Concurrence forte : garde un prix proche du marché pour vendre plus vite.';
    } else if (ratioToLocalAvg >= 1.25) {
      advised *= 0.93;
      high *= 0.96;
      score -= 6;
      marketRecommendation = 'Prix moyen local plus bas que ton estimation : pour vendre plus vite, rapproche-toi du marché ou vends en lot.';
    } else if (ratioToLocalAvg <= 0.8) {
      high = Math.max(high, localAvg * 1.05);
      score += 2;
      marketRecommendation = 'Le marché local semble plus haut que ton estimation : tu peux tester un prix légèrement plus ambitieux.';
    } else {
      marketRecommendation = 'Ton prix est cohérent avec le marché local.';
    }
  }

  if (Number.isFinite(localHigh) && localHigh > 0 && localCompetitionLevel !== 'faible') {
    high = Math.min(high, localHigh);
  }

  if (Number.isFinite(localAvg) && localAvg > 0 && localCompetitionLevel === 'forte') {
    if (high <= advised) {
      high = advised * 1.2;
      if (Number.isFinite(localHigh) && localHigh > 0) {
        high = Math.min(high, localHigh);
      }
    }
  }

  if (Number.isFinite(localAvg) && Number.isFinite(localLow) && localAvg <= localLow * 1.12 && advised <= localAvg) {
    marketRecommendation = 'Prix local bas : attention à ne pas surestimer l’objet.';
  }

  score = clamp(score);
  if (!(Number.isFinite(localAvg) && localAvg > 0 && localCompetitionLevel === 'forte')) {
    quick = advised * 0.8;
  }

  let decision = 'PRIX CORRECT';
  if (form.objective === 'vendre vite') {
    if (isLotFriendly) {
      decision = score >= 50 ? 'VENDS EN LOT' : 'BAISSE LE PRIX';
    } else {
      decision = score >= 60 ? 'VENDS VITE' : 'BAISSE LE PRIX';
    }
  } else if (form.objective === 'vendre au meilleur prix' && score >= 70) {
    decision = 'ATTENDS LE BON ACHETEUR';
  } else if (score >= 75) {
    decision = 'PRIX CORRECT';
  } else if (score >= 55) {
    decision = isLotFriendly ? 'VENDS EN LOT' : 'VENDS VITE';
  } else {
    decision = 'BAISSE LE PRIX';
  }

  const strategy = isLotFriendly
    ? 'Vends en lot de 3 ou 4 pour augmenter la valeur perçue et accélérer la vente.'
    : form.objective === 'vendre vite'
      ? 'Mets un prix attractif et ajoute des photos nettes de l’objet sous plusieurs angles.'
      : form.objective === 'vendre au meilleur prix'
        ? 'Commence au prix haut pendant 5 jours puis baisse si personne ne répond.'
        : 'Prix trop ambitieux, vise la vente rapide.';

  const scoreHint = score >= 75
    ? (decision === 'VENDS EN LOT' ? 'Bon potentiel, mais la vente en lot est recommandée.' : 'Bon potentiel de vente si l’annonce est claire et bien illustrée.')
    : score >= 55
      ? 'Marché moyen : il faut un bon prix et de bonnes photos.'
      : 'Risque de vente lente si le prix est trop haut.';

  const cityLabel = formatCity(form.city);
  const normalizedSellingAdvice = (aiSellingAdvice || '').trim() || defaultSellingAdviceByCategory[form.category] || defaultSellingAdviceByCategory.autre;
  const baseTitle = safeText(aiSellingTitle, safeText(form.name, 'Objet'));
  const title = safeText(`${baseTitle} - ${safeText(form.condition, 'bon')} - disponible à ${cityLabel}`, 'Objet disponible');
  const normalizedName = safeText(form.name).toLowerCase();
  const hasLotHintInName = lotNameHints.some((hint) => normalizedName.includes(hint));
  const addLot = (decision === 'VENDS EN LOT' && isLotFriendly) || hasLotHintInName ? ' Possibilité de faire un prix pour un lot.' : '';
  const photoSentence = hasPhoto ? ' Photos disponibles dans l’annonce.' : '';
  const aiDescriptionSentence = safeText(aiDescription) ? ` ${cleanMarketplaceDescription(aiDescription)}` : ` Idéal pour la catégorie ${safeText(form.category, 'autre')}.`;
  const description = safeText(`Je vends ${safeText(form.name, 'cet objet')}, en état ${safeText(form.condition, 'bon')}.${aiDescriptionSentence} Disponible à ${cityLabel}.${photoSentence} Prix raisonnable. Possibilité de venir voir sur place.${addLot}`, 'Annonce indisponible');
  const level = ease === 'bon' || ease === 'bon mais risqué' ? 'facile à vendre' : ease;
  const observedMarketParts = [];
  if (Number.isFinite(localLow)) observedMarketParts.push(`bas ${safeMoney(localLow)}`);
  if (Number.isFinite(localAvg)) observedMarketParts.push(`moyenne ${safeMoney(localAvg)}`);
  if (Number.isFinite(localHigh)) observedMarketParts.push(`haut ${safeMoney(localHigh)}`);
  const observedMarketSummary = observedMarketParts.length > 0 ? `Marché local observé : ${observedMarketParts.join(', ')}.` : ''; 
  return {
    quick,
    advised,
    high,
    score,
    ease: level,
    strategy,
    decision,
    title,
    description,
    scoreHint,
    aiPhotoTips,
    aiSellingAdvice: normalizedSellingAdvice,
    aiWarning: normalizeSellWarning(aiWarning),
    localCompetitionLevel,
    localAveragePrice: localAvg,
    observedMarketSummary,
    marketRecommendation
  };
}

function computeOpportunities(form) {
  const budget = Math.max(0, safeNumber(form.budget, 50) || 50);
  const minMargin = Math.max(0, safeNumber(form.minMargin, 20) || 20);
  const hours = Math.max(0, safeNumber(form.hours, 1) || 1);
  const risk = riskLevels.includes(form.risk) ? form.risk : 'faible';
  const category = opportunityCategories.includes(form.category) ? form.category : 'autre';
  const map = {
    outil: { items: ['perceuse sans fil', 'visseuse', 'scie circulaire', 'ponceuse', 'lot d’outils', 'coffre à outils'], tip: 'Cherche les lots mal décrits, les outils avec batterie/chargeur, et évite les outils sans test.', keys: ['perceuse sans fil', 'lot outils', 'outil batterie chargeur', 'visseuse', 'garage sale outils'] },
    téléphone: { items: risk === 'faible' ? ['iPhone ancien modèle (très prudent)', 'Samsung Galaxy (très prudent)'] : ['iPhone ancien modèle', 'Samsung Galaxy'], tip: 'Risque élevé : vérifie IMEI, iCloud, batterie, facture, opérateur et écran.', keys: ['iPhone usagé', 'Samsung Galaxy usagé', 'téléphone débloqué', 'téléphone facture', 'cellulaire batterie'] },
    meuble: { items: ['meuble TV', 'table basse', 'chaise', 'commode'], tip: 'Attention au transport, aux dimensions et au temps de revente. Privilégie les petits meubles.', keys: ['table basse', 'chaise lot', 'petit meuble', 'commode', 'meuble tv'] },
    'électroménager': { items: ['aspirateur', 'cafetière', 'micro-ondes', 'air fryer'], tip: 'Teste le fonctionnement avant achat.', keys: ['aspirateur', 'micro-ondes', 'cafetière', 'air fryer', 'petit électro'] },
    bijoux: { items: ['lots de bracelets', 'bijoux fantaisie', 'lots de colliers'], tip: 'Le lot est souvent plus intéressant que la pièce seule.', keys: ['lot bijoux', 'bracelets lot', 'colliers lot', 'bijoux fantaisie', 'bijoux vintage'] },
    vêtement: { items: ['lots de vêtements', 'manteaux', 'baskets propres', 'marques connues'], tip: 'Vérifie taille, état, marque et saison.', keys: ['lot vêtements', 'manteau marque', 'baskets', 'vêtements marque', 'friperie lot'] },
    jouet: { items: ['Lego', 'Playmobil', 'jeux de société', 'lots de jouets'], tip: 'Les lots et marques connues se revendent mieux.', keys: ['lego lot', 'playmobil lot', 'jeu société', 'jouets lot', 'jouet marque'] },
    sport: { items: ['haltères', 'vélo enfant', 'tapis de marche', 'accessoires fitness'], tip: 'Vérifie état, encombrement et demande locale.', keys: ['haltères', 'vélo enfant', 'tapis marche', 'fitness accessoires', 'sport maison'] },
    déco: { items: ['miroirs', 'lampes', 'cadres', 'petits lots déco'], tip: 'Photos propres et style actuel importants.', keys: ['miroir déco', 'lampe', 'cadres', 'lot déco', 'décoration maison'] },
    'pièce auto': { items: ['phares', 'feux arrière', 'jantes', 'pièces carrosserie'], tip: 'Vérifie compatibilité modèle/année et état.', keys: ['phare auto', 'feu arrière', 'jante', 'pièce carrosserie', 'pièce auto modèle'] },
    autre: { items: ['objets de niche à bas prix', 'lots multi-objets', 'marques connues'], tip: 'Commence par des objets simples à tester, transporter et revendre vite.', keys: ['lot', 'débarras', 'vente rapide', 'objet marque', 'petit prix'] }
  };
  const details = map[category] || map.autre;
  const round2 = (value) => Math.round(value * 100) / 100;
  const clampBudget = (value) => round2(Math.min(budget, Math.max(0, value)));

  let low;
  let targetHigh;
  let max;

  if (category === 'outil') {
    low = clampBudget(Math.max(5, budget * 0.20));
    targetHigh = clampBudget(Math.max(low, Math.min(budget * 0.50, budget - minMargin)));
    max = clampBudget(Math.max(targetHigh, Math.min(budget * 0.60, budget - minMargin)));
  } else {
    const riskCoef = risk === 'faible' ? 0.9 : risk === 'moyen' ? 1 : 1.12;
    const timeCoef = hours <= 1 ? 0.9 : hours <= 2 ? 1 : 1.12;
    const categoryCoef = category === 'téléphone' ? 1.08 : category === 'meuble' ? 0.95 : 1;
    const rawMax = Math.max(5, (budget - minMargin) * 0.85 * riskCoef * timeCoef * categoryCoef);
    max = clampBudget(Math.round(rawMax / 5) * 5);
    targetHigh = clampBudget(Math.max(5, Math.round((max * 0.83) / 5) * 5));
    low = clampBudget(Math.max(5, Math.round((targetHigh * 0.5) / 5) * 5));
  }

  const dangerSignalsByCategory = {
    outil: ['pas de test possible', 'batterie absente', 'chargeur manquant', 'outil cassé ou bruyant', 'marque inconnue', 'prix proche du prix de revente', 'photos floues ou non réelles'],
    téléphone: ['téléphone bloqué', 'iCloud/Google lock', 'IMEI douteux', 'batterie faible', 'écran fissuré', 'facture absente'],
    meuble: ['trop encombrant', 'transport compliqué', 'dimensions absentes', 'tissu taché', 'bois gonflé ou cassé']
  };
  const dangerSignals = dangerSignalsByCategory[category] || ['pas de test possible', 'objet cassé', 'prix proche du prix de revente', 'aucune photo réelle', 'vendeur flou'];

  const planByCategory = {
    outil: `Cherche 10 annonces. Garde celles sous ${money(targetHigh)}. Priorité aux outils avec batterie/chargeur inclus. Demande une vidéo ou teste sur place avant achat.`
  };
  const plan = planByCategory[category] || `Cherche 10 annonces. Garde celles où tu peux acheter sous ${money(targetHigh)}. Contacte vite les vendeurs et teste l’objet avant achat.`;

  return {
    items: details.items,
    categoryTip: details.tip,
    keywords: details.keys,
    summary: {
      todo: `${details.items.slice(0, 3).join(', ')} à ${formatCity(form.city)}.`,
      why: risk === 'faible' && category === 'téléphone' ? 'Tu veux limiter le risque, donc ce segment est plus sensible et demande plus de vérifications.' : `Ces objets offrent souvent une rotation correcte avec un budget de ${money(budget)}.`,
      action: `Cherche 10 annonces et garde seulement celles sous ${money(targetHigh)} avec test possible.`
    },
    priceRange: { low, targetHigh, max },
    positiveSignals: ['prix bas', 'annonce mal écrite mais objet intéressant', 'lot', 'vendeur pressé', 'accessoires inclus', 'photos réelles', 'marque connue'],
    dangerSignals,
    plan
  };
}

function computeFlip(form){const ask=Number(form.ask)||0; const costs=Number(form.costs)||0; const hours=Number(form.hours)||0; const minMargin=Number(form.minMargin)||0; const localCount=form.localCount===''?null:Number(form.localCount); const localLow=form.localLow===''?null:Number(form.localLow); const localAvg=form.localAvg===''?null:Number(form.localAvg); const localHigh=form.localHigh===''?null:Number(form.localHigh); const timeCost=hours*5; const isDamaged=form.condition==='abîmé'; const isBulky=form.category==='meuble' || form.category==='électroménager'; const isDamagedBulky=isBulky && isDamaged; const isPhone=form.category==='téléphone'; const isToolGood=form.category==='outil' && form.condition==='bon'; const baseMultiplier=categoryResaleMultiplier[form.category]||1; const conditionImpact=1+conditionCoef[form.condition]*0.3; const damagedPenalty=isDamaged?0.72:1; const bulkyPenalty=isBulky && (form.condition==='abîmé' || form.condition==='correct')?0.9:1; const basePriceResale=ask*baseMultiplier*conditionImpact*damagedPenalty*bulkyPenalty; const floorBase=(flipResaleFloorByCategory[form.category]||0)*(flipResaleFloorConditionMultiplier[form.condition]||1); const adjustedFloor=isDamagedBulky?floorBase*0.75:isDamaged?floorBase*0.85:floorBase;
 const categoryFloor=flipResaleFloorByCategory[form.category]||0; const askRatioToFloor=categoryFloor>0?ask/categoryFloor:1;
 const conservativePricePenalty=askRatioToFloor>=1.5?0.82:askRatioToFloor>=1.15?0.9:1;
 const phonePenalty=isPhone?0.9:1; const toolPenalty=isToolGood?0.92:1; const priceBasedResale=basePriceResale*conservativePricePenalty*phonePenalty*toolPenalty;
 const resale=Math.max(priceBasedResale,adjustedFloor); const gross=resale-ask; const net=resale-ask-costs-timeCost; const maxBuy=resale-costs-timeCost-minMargin; const ease=easeByCategory[form.category]; const bulkyRiskPenalty=isBulky && (form.condition==='abîmé' || form.condition==='correct'); const risk = isPhone ? 'élevé' : (isDamaged || ease==='difficile' || bulkyRiskPenalty ? 'élevé' : ease==='niche' ? 'moyen' : 'faible');
 const roundedMaxBuy=Math.floor(maxBuy); const hasUsableMaxBuy=maxBuy>=5;
 let decision='ACHÈTE'; let strategy=''; let score=75;
 if(net<=0){decision='LAISSE TOMBER'; score=clamp(20+Math.max(net,-25),0,40); strategy='Marge nette négative : après frais et temps passé, ce deal ne vaut pas le coup.';}
 else if(net<minMargin){decision='NÉGOCIE'; const progress=minMargin>0?net/minMargin:0.5; score=clamp(45+progress*25,45,70); strategy='Marge possible, mais elle devient faible après frais et temps passé. Négocie plus bas.';}
 else {decision='ACHÈTE'; const surplus=net-minMargin; score=clamp(75+surplus*0.8+(risk==='faible'?4:0),75,100); strategy='Bon deal potentiel : le prix demandé est bas par rapport à la revente probable. Vérifie l’état réel, la marque, les accessoires et teste l’objet avant d’acheter.';}
 if(isDamaged){score=clamp(score-18,0,100); if(decision==='ACHÈTE') decision=net>=minMargin*1.4 ? 'NÉGOCIE' : 'LAISSE TOMBER'; strategy='Objet abîmé : prudence renforcée. Prévois une revente plus lente, plus de négociation côté acheteurs et une marge moins fiable.';}
 if(isDamagedBulky){if(ask>30){decision=net>0?'NÉGOCIE':'LAISSE TOMBER'; score=Math.min(score,45);} if(decision==='ACHÈTE') decision='NÉGOCIE'; if(ask>30 && net<=0) decision='LAISSE TOMBER'; strategy='Objet encombrant et abîmé : risque élevé de revente lente, transport compliqué et faible demande.';}
 if(form.category==='meuble' && (form.condition==='abîmé' || form.condition==='correct')) score=Math.min(score,45);
 if(form.category==='pièce auto') score=Math.min(score,80);
 if(isPhone) score=Math.min(score,85);
 if(isToolGood && !(ask<=categoryFloor*0.8)) score=Math.min(score,70);
 if(isToolGood && ask>=50 && net<=minMargin+8 && net>0) decision='NÉGOCIE';
 if(isPhone && askRatioToFloor>=2.6 && net>=minMargin) decision='NÉGOCIE';
 const isBorderlineToolDeal = decision==='LAISSE TOMBER' && form.category==='outil' && form.condition==='bon' && gross>0 && ease==='bon' && net>=-5 && net<=5;
 if(isBorderlineToolDeal){
  decision='NÉGOCIE';
  score=clamp(48 + (net * 1.2),40,55);
  strategy='Deal limite : pas rentable au prix actuel, mais intéressant si tu négocies plus bas.';
 }
 if(isPhone){strategy='Vérifie IMEI, iCloud, batterie, facture, opérateur et état écran avant achat.';}
 if(isToolGood && !isBorderlineToolDeal){strategy='Bon objet à revendre, mais vérifie batterie, chargeur, marque, puissance et fonctionnement. Négocie si possible.';}
 const localInsights=[];
 let localCompetitionLevel='non renseignée';
 if(Number.isFinite(localCount)){
  if(localCount<=5){localCompetitionLevel='faible'; score=clamp(score+4,0,100); localInsights.push('Peu d’annonces similaires : bon potentiel si le prix est attractif.');}
  else if(localCount<=20){localCompetitionLevel='moyenne';}
  else {localCompetitionLevel='forte'; score=clamp(score-7,0,100); localInsights.push('Beaucoup d’annonces similaires : il faudra vendre moins cher ou avoir de meilleures photos.'); if(ease==='difficile' || risk==='élevé'){score=clamp(score-5,0,100);}}
 }
 if(Number.isFinite(localAvg) && localAvg>0){
  const ratio=ask/localAvg;
  if(ratio<=0.7){score=clamp(score+5,0,100); localInsights.push('Prix demandé très inférieur au prix moyen : opportunité possible, vérifie l’état réel.');}
  else if(ratio>=0.85 && ratio<=1.1){score=clamp(score-5,0,100); localInsights.push('Prix demandé proche du prix moyen : négocie avant d’acheter.');}
  else if(ratio>1.1){score=clamp(score-10,0,100); localInsights.push('Prix demandé au-dessus du marché local : risque de marge faible.');}
  else {localInsights.push('Prix demandé inférieur au marché local : bon potentiel si l’état est confirmé.');}
 }
 if(decision==='LAISSE TOMBER' && net<0 && resale>0){score=clamp(Math.max(score,15),10,20);}
 const qualifiesLowPriceAutoBuy = !isPhone
  && lowRiskBuyCategories.has(form.category)
  && risk==='faible'
  && ease==='bon'
  && ask<=15
  && minMargin>0
  && net>=minMargin*0.7
  && net>0;
 if(qualifiesLowPriceAutoBuy){
  decision='ACHÈTE';
  score=clamp(Math.max(score,74),74,92);
  strategy='Prix demandé bas et marge nette positive. Vérifie l’état, les accessoires et récupère rapidement.';
 }
 if(decision!=='LAISSE TOMBER' && net<=0) decision='LAISSE TOMBER';
 if(decision==='ACHÈTE' && score<70) decision='NÉGOCIE';
 if(score<45 && decision==='ACHÈTE') decision='NÉGOCIE';
 if(score<35 && decision==='NÉGOCIE') decision='LAISSE TOMBER';
 const realisticRange=isPhone && decision==='NÉGOCIE'?[0.85,0.95]:isBorderlineToolDeal?[0.75,0.82]:isDamagedBulky?[0.4,0.6]:isDamaged?[0.45,0.65]:ease==='bon'?[0.7,0.8]:[0.6,0.85];
 const realisticOffer=Math.round(ask*((realisticRange[0]+realisticRange[1])/2));
 const suggestedOffer=decision==='NÉGOCIE' && hasUsableMaxBuy?Math.round(Math.min(realisticOffer,roundedMaxBuy)):realisticOffer;
 const displayMaxBuy=hasUsableMaxBuy?`${roundedMaxBuy} $`:'Non rentable';
 const displayOffer=decision==='NÉGOCIE'?`${suggestedOffer} $`:decision==='ACHÈTE'?'Prix demandé correct':'Non rentable';
 const negotiationMessage = decision==='LAISSE TOMBER'
  ? 'Non rentable'
  : decision==='ACHÈTE'
    ? 'Bonjour, votre annonce m’intéresse. Est-ce que l’objet est toujours disponible ? Si l’état est conforme, je peux venir le chercher rapidement.'
    : `Bonjour, votre annonce m’intéresse. Est-ce que vous accepteriez ${suggestedOffer} $ si je viens le chercher rapidement ?`;
 const maxBuyAdvice=!hasUsableMaxBuy
  ? 'Ce deal n’est pas rentable au prix actuel. Ne négocie que si le vendeur accepte un prix très bas.'
  : '';
 const marketRecommendation = localInsights[localInsights.length - 1] || 'Concurrence non renseignée : base-toi sur les marges et le risque du produit.';
 const observedMarketSummary = Number.isFinite(localLow) && Number.isFinite(localAvg) && Number.isFinite(localHigh)
  ? `Marché local observé : ${money(localLow)} à ${money(localHigh)}, moyenne ${money(localAvg)}.`
  : '';
 return {ask,costs,hours,timeCost,resale,gross,net,maxBuy,displayMaxBuy,displayOffer,maxBuyAdvice,score,risk,decision,strategy,negotiationMessage,ease,localCompetitionLevel,localAveragePrice:localAvg,observedMarketSummary,marketRecommendation,suggestedOffer};}

function SellResult({ data, actions }) {const tone = data.decision.includes('BAISSE') ? 'bad' : data.decision.includes('LOT') || data.decision.includes('VITE') ? 'warn' : 'good'; const summary = getSellDecisionSummary(data); const showLocalMarket = data.localCompetitionLevel !== 'non renseignée' || Number.isFinite(data.localAveragePrice) || Boolean(data.observedMarketSummary); const hasAiTips = Array.isArray(data.aiPhotoTips) && data.aiPhotoTips.length > 0; const hasAiSection = hasAiTips || Boolean(data.aiSellingAdvice) || Boolean(data.aiWarning); return <article className={`result ${tone}`}>
  <h3>{data.decision}</h3><Score score={data.score} tone={tone}/><p className="score-note">{data.scoreHint}</p>
  <section className="decision-summary"><p className="decision-summary-title">Résumé décision</p><p><strong>À faire :</strong> {summary.todo}</p><p><strong>Pourquoi :</strong> {summary.why}</p><p><strong>Action :</strong> {summary.action}</p></section>
  <section className="result-section"><p className="result-section-title">Prix conseillés</p><p><strong>Prix vente rapide:</strong> {money(data.quick)}</p><p><strong>Prix conseillé:</strong> {money(data.advised)}</p><p><strong>Prix haut:</strong> {money(data.high)}</p></section>
  {showLocalMarket && <section className="result-section"><p className="result-section-title">Marché local</p><p><strong>Concurrence locale:</strong> {data.localCompetitionLevel}</p>{Number.isFinite(data.localAveragePrice) && <p><strong>Prix moyen local:</strong> {money(data.localAveragePrice)}</p>}{data.observedMarketSummary && <p><strong>Marché local observé:</strong> {data.observedMarketSummary.replace('Marché local observé : ','')}</p>}<p><strong>Recommandation marché:</strong> {data.marketRecommendation}</p></section>}
  <section className="result-section"><p className="result-section-title">Stratégie</p><p><strong>Niveau:</strong> {data.ease}</p><p><strong>Stratégie:</strong> {data.strategy}</p></section>
  <section className="result-section"><p className="result-section-title">Annonce Marketplace</p><p><strong>Titre:</strong> {data.title}</p><p><strong>Description:</strong> {data.description}</p></section>
  {hasAiSection && <section className="result-section"><p className="result-section-title">Conseils IA</p>{hasAiTips && <div className="ai-advice-block"><p className="ai-advice-subtitle">Conseils photo IA</p><ul>{data.aiPhotoTips.map((tip, index) => <li key={`${tip}-${index}`}>{tip}</li>)}</ul></div>}{data.aiSellingAdvice && <div className="ai-advice-block"><p className="ai-advice-subtitle">Conseil de mise en vente IA</p><p>{data.aiSellingAdvice}</p></div>}{data.aiWarning && <div className="ai-advice-block"><p className="ai-advice-subtitle">Avertissement IA</p><p>{data.aiWarning}</p></div>}</section>}
  <section className="result-section"><p className="result-section-title">Actions</p><div className="actions"><button className="primary" onClick={actions.copyTitle}>Copier le titre</button><button className="secondary" onClick={actions.copyDescription}>Copier la description</button><button className="secondary" onClick={actions.copyFullAd}>Copier l’annonce complète</button>{actions.showPhotoTipsCopyButton && <button className="secondary" onClick={actions.copyPhotoTips}>Copier les conseils photo</button>}<button onClick={actions.resetSellForm}>Recommencer</button></div></section>
</article>; }

function FlipResult({ data, category, actions }) {const tone = data.decision==='ACHÈTE' ? 'good' : data.decision==='NÉGOCIE' ? 'warn' : 'bad'; const summary = getFlipDecisionSummary(data, category); const showLocalMarket = data.localCompetitionLevel !== 'non renseignée' || Number.isFinite(data.localAveragePrice) || Boolean(data.observedMarketSummary); return <article className={`result ${tone}`}>
  <h3>{data.decision}</h3><Score score={data.score} tone={tone}/>
  <section className="decision-summary"><p className="decision-summary-title">Résumé décision</p><p><strong>À faire :</strong> {summary.todo}</p><p><strong>Pourquoi :</strong> {summary.why}</p><p><strong>Action :</strong> {summary.action}</p></section>
  <section className="result-section"><p className="result-section-title">Prix et marge</p>{data.decision==='ACHÈTE'
    ? <><p><strong>Prix demandé:</strong> {money(data.ask)}</p><p><strong>Prix demandé correct</strong></p></>
    : data.decision==='LAISSE TOMBER'
      ? <p><strong>Prix de négociation conseillé:</strong> Non rentable</p>
      : <><p><strong>Prix max théorique:</strong> {data.displayMaxBuy}</p><p><strong>Prix de négociation conseillé:</strong> {data.displayOffer}</p></>}
  <p><strong>Prix revente probable:</strong> {money(data.resale)}</p><p><strong>Marge brute:</strong> {money(data.gross)}</p><p><strong>Marge nette:</strong> {money(data.net)}</p><p><strong>Frais estimés:</strong> {money(data.costs)}</p><p><strong>Temps estimé:</strong> {data.hours} h</p><p><strong>Coût temps estimé:</strong> {money(data.timeCost)}</p></section>
  <section className="result-section"><p className="result-section-title">Risque et revente</p><p><strong>Risque:</strong> {data.risk}</p><p><strong>Facilité revente:</strong> {data.ease}</p></section>
  {showLocalMarket && <section className="result-section"><p className="result-section-title">Marché local</p><p><strong>Concurrence locale:</strong> {data.localCompetitionLevel}</p>{Number.isFinite(data.localAveragePrice) && <p><strong>Prix moyen local:</strong> {money(data.localAveragePrice)}</p>}{data.observedMarketSummary && <p><strong>Marché local observé:</strong> {data.observedMarketSummary.replace('Marché local observé : ','')}</p>}<p><strong>Recommandation marché:</strong> {data.marketRecommendation}</p></section>}
  <section className="result-section"><p className="result-section-title">Conseil</p><p><strong>Conseil:</strong> {data.strategy}</p>{data.maxBuyAdvice && <p><strong>Note:</strong> {data.maxBuyAdvice}</p>}<p><strong>Message vendeur:</strong> {data.negotiationMessage}</p></section>
  <section className="result-section"><p className="result-section-title">Actions</p><div className="actions"><button className="primary" onClick={actions.copy}>Copier le message</button><button onClick={actions.reset}>Recommencer</button></div></section>
</article>; }

const Score = ({ score, tone: forcedTone }) => {
  const tone = forcedTone ?? (score >= 75 ? 'good' : score >= 55 ? 'warn' : 'bad');
  return <div className="score-block"><div className={`score ${tone}`}><div className="bar" style={{width:`${score}%`}} /></div><p className="score-label">Score {Math.round(score)}/100</p></div>;
};

export default App;
function HistoryMode({ entries, onBack, onDelete, onClear }) {
  const [selected, setSelected] = useState(null);
  const [exportMessage, setExportMessage] = useState('');
  const hasEntries = entries.length > 0;
  const clearAll = () => { if (window.confirm('Supprimer tout l’historique ?')) onClear(); };
  const handleExportCsv = () => {
    if (!hasEntries) {
      setExportMessage('Historique vide : rien à exporter.');
      return;
    }
    const csvContent = buildHistoryCsv(entries);
    downloadFile('dealcheck_historique.csv', `\uFEFF${csvContent}`, 'text/csv;charset=utf-8;');
    setExportMessage('Export CSV généré');
  };
  const handleExportJson = () => {
    if (!hasEntries) {
      setExportMessage('Historique vide : rien à exporter.');
      return;
    }
    const safeHistory = entries.map((entry) => sanitizeHistoryForExport(entry));
    downloadFile('dealcheck_historique.json', JSON.stringify(safeHistory, null, 2), 'application/json;charset=utf-8;');
    setExportMessage('Export JSON généré');
  };
  return <div>
    <div className="header"><button onClick={onBack}>← Retour accueil</button><h2>Historique</h2></div>
    <div className="actions history-actions">
      <button className="secondary" onClick={handleExportCsv} disabled={!hasEntries}>Exporter CSV</button>
      <button className="secondary" onClick={handleExportJson} disabled={!hasEntries}>Exporter JSON</button>
      <button className="secondary" onClick={clearAll}>Vider l’historique</button>
    </div>
    {exportMessage && <p className="field-hint">{exportMessage}</p>}
    {!entries.length && <p>Aucune analyse sauvegardée.</p>}
    <section className="history-list">
      {entries.map((entry) => <article key={entry.id} className="history-card">
        <p>{formatHistoryDate(entry.createdAt)} • <span className="history-tag">{safeText(entry.modeLabel, 'Mode')}</span></p>
        <p><strong>{safeText(entry.name || entry.category, 'Sans nom')}</strong></p>
        <p>{safeText(entry.decision, 'N/A')} • {safeText(entry.keyMetricLabel, 'Info')}: {safeText(entry.keyMetricValue, 'N/A')}</p>
        <div className="actions">
          <button className="secondary" onClick={() => setSelected(entry)}>Voir détail</button>
          <button onClick={() => onDelete(entry.id)}>Supprimer</button>
        </div>
      </article>)}
    </section>
    {selected && <article className="result">
      <h3>Détail</h3>
      {Object.entries(selected.details || {}).map(([key, value]) => {
        const displayKey = key === 'photoUsed' ? 'Photo utilisée' : key;
        const normalizedValue = typeof value === 'string' ? value.trim() : value;
        const displayValue = key === 'Score'
          ? `${Number(normalizedValue).toFixed(Number.isInteger(Number(normalizedValue)) ? 0 : 1)}/100`
          : key === 'photoUsed'
            ? (String(normalizedValue).toLowerCase() === 'true' ? 'oui' : 'non')
            : key === 'Concurrence locale' && (normalizedValue === 'N/A' || normalizedValue === '')
              ? 'non renseignée'
              : safeText(normalizedValue, 'N/A');
        return <p key={key}><strong>{displayKey} :</strong> {displayValue}</p>;
      })}
      <button onClick={() => setSelected(null)}>Fermer</button>
    </article>}
  </div>;
}

function loadHistory() { try { const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function saveHistory(entries) { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT))); }
function createHistoryId() { return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function formatHistoryDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Date inconnue' : date.toLocaleString('fr-CA'); }
function buildSellHistoryEntry(form, data, photoUsed) { return { id: createHistoryId(), createdAt: new Date().toISOString(), mode: 'sell', modeLabel: 'Vente', name: safeText(form.name, 'Objet'), category: safeText(form.category, 'autre'), decision: safeText(data.decision, 'N/A'), keyMetricLabel: 'Prix conseillé', keyMetricValue: safeMoney(data.advised), details: { 'Date/heure': formatHistoryDate(new Date().toISOString()), Mode: 'vente', Objet: safeText(form.name, 'Objet'), Catégorie: safeText(form.category, 'autre'), État: safeText(form.condition, 'N/A'), Ville: safeText(form.city, 'N/A'), Décision: safeText(data.decision, 'N/A'), Score: safeNumber(data.score, 0), 'Prix vente rapide': safeMoney(data.quick), 'Prix conseillé': safeMoney(data.advised), 'Prix haut': safeMoney(data.high), 'Concurrence locale': safeText(data.localCompetitionText, 'N/A'), 'Titre final': safeText(data.title, 'N/A'), 'Description finale': safeText(data.description, 'N/A'), photoUsed: photoUsed ? 'true' : 'false' } }; }
function buildFlipHistoryEntry(form, data) { return { id: createHistoryId(), createdAt: new Date().toISOString(), mode: 'flip', modeLabel: 'Achat-revente', name: safeText(form.name, 'Objet'), category: safeText(form.category, 'autre'), decision: safeText(data.decision, 'N/A'), keyMetricLabel: 'Marge nette', keyMetricValue: safeMoney(data.net), details: { 'Date/heure': formatHistoryDate(new Date().toISOString()), Mode: 'achat-revente', Objet: safeText(form.name, 'Objet'), Catégorie: safeText(form.category, 'autre'), État: safeText(form.condition, 'N/A'), Ville: safeText(form.city, 'N/A'), Décision: safeText(data.decision, 'N/A'), Score: safeNumber(data.score, 0), 'Prix demandé': safeMoney(form.ask), 'Prix revente probable': safeMoney(data.resale), 'Marge brute': safeMoney(data.gross), 'Marge nette': safeMoney(data.net), 'Prix négociation conseillé': safeMoney(data.suggestedOffer), Risque: safeText(data.risk, 'N/A'), 'Concurrence locale': safeText(data.localCompetitionText, 'N/A'), photoUsed: 'false' } }; }
function buildOpportunityHistoryEntry(form, data) { return { id: createHistoryId(), createdAt: new Date().toISOString(), mode: 'opportunities', modeLabel: 'Recherche', category: safeText(form.category, 'autre'), decision: safeText(data.summary?.todo, 'N/A'), keyMetricLabel: 'Prix max conseillé', keyMetricValue: safeMoney(data.priceRange?.max), details: { 'Date/heure': formatHistoryDate(new Date().toISOString()), Mode: 'recherche opportunités', Catégorie: safeText(form.category, 'autre'), Ville: safeText(form.city, 'N/A'), Budget: safeMoney(form.budget), 'Marge minimum': safeMoney(form.minMargin), 'Risque accepté': safeText(form.risk, 'N/A'), 'Objets recommandés': (data.items || []).map((v) => safeText(v)).filter(Boolean).join(', '), 'Prix achat cible': `${safeMoney(data.priceRange?.low)} - ${safeMoney(data.priceRange?.max)}`, 'Plan d’action': safeText(data.plan, 'N/A'), photoUsed: 'false' } }; }

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value) {
  const normalized = safeText(value, '');
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
}

function buildHistoryCsv(entries) {
  const headers = ['date', 'mode', 'objet', 'categorie', 'etat', 'ville', 'decision', 'score', 'prix_conseille', 'prix_demande', 'prix_revente_probable', 'marge_nette', 'prix_max_conseille', 'risque', 'photo_utilisee'];
  const rows = entries.map((entry) => {
    const details = entry.details || {};
    return [
      formatHistoryDate(entry.createdAt),
      safeText(entry.modeLabel, safeText(entry.mode, 'N/A')),
      safeText(entry.name, safeText(details.Objet, '')),
      safeText(entry.category, safeText(details.Catégorie, '')),
      safeText(details.État, ''),
      safeText(details.Ville, ''),
      safeText(entry.decision, safeText(details.Décision, '')),
      safeText(details.Score, ''),
      safeText(details['Prix conseillé'], ''),
      safeText(details['Prix demandé'], ''),
      safeText(details['Prix revente probable'], ''),
      safeText(details['Marge nette'], ''),
      safeText(details['Prix max conseillé'], safeText(entry.keyMetricLabel === 'Prix max conseillé' ? entry.keyMetricValue : '', '')),
      safeText(details.Risque, safeText(details['Risque accepté'], '')),
      String(safeText(details.photoUsed, 'false')).toLowerCase() === 'true' ? 'oui' : 'non'
    ].map((cell) => escapeCsvValue(cell)).join(';');
  });
  return [headers.join(';'), ...rows].join('\n');
}

function sanitizeHistoryForExport(value, parentKey = '') {
  if (Array.isArray(value)) return value.map((item) => sanitizeHistoryForExport(item, parentKey));
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, currentValue]) => {
      const lowered = `${parentKey}.${key}`.toLowerCase();
      if (lowered.includes('photo') || lowered.includes('image') || lowered.includes('base64') || lowered.includes('api') || lowered.includes('key')) return acc;
      acc[key] = sanitizeHistoryForExport(currentValue, lowered);
      return acc;
    }, {});
  }
  if (value == null || Number.isNaN(value)) return '';
  return value;
}
