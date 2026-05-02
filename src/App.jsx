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

const money = (n) => `${(Number.isFinite(n) ? n : 0).toFixed(2)} $`;
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
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

function App() {
  const [mode, setMode] = useState('home');
  return (
    <main className="app">
      <section className="card">
        {mode === 'home' && <Home setMode={setMode} />}
        {mode === 'sell' && <SellMode onBack={() => setMode('home')} />}
        {mode === 'flip' && <FlipMode onBack={() => setMode('home')} />}
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
    </div>
  </>;
}

function SellMode({ onBack }) {
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
    if (!form.name.trim()) nextErrors.name = 'Merci de remplir les champs obligatoires avant l’analyse.';
    const value = Number(form.value);
    if (!form.value || !Number.isFinite(value) || value <= 0) {
      nextErrors.value = 'Indique une valeur supérieure à 0 pour obtenir une estimation.';
    }
    if (!form.city.trim()) nextErrors.city = 'Merci de remplir les champs obligatoires avant l’analyse.';
    const localCount = Number(form.localCount);
    const localLow = Number(form.localLow);
    const localAvg = Number(form.localAvg);
    const localHigh = Number(form.localHigh);
    const hasLocalLow = form.localLow !== '';
    const hasLocalAvg = form.localAvg !== '';
    const hasLocalHigh = form.localHigh !== '';
    if (form.localCount !== '' && (!Number.isFinite(localCount) || localCount < 0)) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    if (hasLocalLow && (!Number.isFinite(localLow) || localLow < 0)) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    if (hasLocalAvg && (!Number.isFinite(localAvg) || localAvg < 0)) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    if (hasLocalHigh && (!Number.isFinite(localHigh) || localHigh < 0)) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    if (hasLocalLow && hasLocalAvg && localLow > localAvg) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    if (hasLocalAvg && hasLocalHigh && localAvg > localHigh) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const analyzeSell = () => {
    if (!validateSellForm()) return;
    setHasResult(true);
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
    const cleanedText = (text || '').trim();
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
          <p><strong>Objet détecté :</strong> {aiSuggestion.objectName}</p>
          <p><strong>Catégorie proposée :</strong> {aiSuggestion.category}</p>
          <p><strong>État apparent :</strong> {aiSuggestion.condition}</p>
          <p><strong>Mots-clés :</strong> {Array.isArray(aiSuggestion.keywords) ? aiSuggestion.keywords.join(', ') : ''}</p>
          <p><strong>Description proposée :</strong> {aiSuggestion.description}</p>
          <p><strong>Titre court :</strong> {aiSuggestion.shortTitle || '—'}</p>
          <p><strong>Titre vendeur :</strong> {aiSuggestion.sellingTitle || '—'}</p>
          <p><strong>Description courte :</strong> {aiSuggestion.shortDescription || '—'}</p>
          <p><strong>Description détaillée :</strong> {aiSuggestion.detailedDescription || '—'}</p>
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
          <div><strong>Conseils photo :</strong>{Array.isArray(aiSuggestion.photoTips) && aiSuggestion.photoTips.length > 0 ? <ul>{aiSuggestion.photoTips.map((tip, index) => <li key={`${tip}-${index}`}>{tip}</li>)}</ul> : <span> —</span>}</div>
          <p><strong>Conseil de mise en vente :</strong> {aiSuggestion.sellingAdvice || '—'}</p>
          <p><strong>Confiance :</strong> {aiSuggestion.confidence}</p>
          <p><strong>Avertissement :</strong> {aiSuggestion.warning}</p>
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
      <FormField label="Nombre d’annonces similaires" error={errors.localCompetition} invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localCount} onChange={(e)=>{updateSellField('localCount', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      <FormField label="Prix le plus bas observé" error={errors.localCompetition} invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localLow} onChange={(e)=>{updateSellField('localLow', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      <FormField label="Prix moyen observé" error={errors.localCompetition} invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localAvg} onChange={(e)=>{updateSellField('localAvg', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      <FormField label="Prix le plus haut observé" error={errors.localCompetition} invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localHigh} onChange={(e)=>{updateSellField('localHigh', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
    </section>
    {(errors.form || errors.name || errors.value || errors.city) && <p className="form-error">Merci de remplir les champs obligatoires avant l’analyse.</p>}
    <div className="actions"><button className="primary" onClick={analyzeSell}>Analyser mon objet</button></div>
    {showResult && <SellResult data={data} />}
    {showResult && <div className="actions">
      <button className="primary" onClick={copyTitle}>Copier le titre</button>
      <button className="secondary" onClick={copyDescription}>Copier la description</button>
      <button className="secondary" onClick={copyFullAd}>Copier l’annonce complète</button>
      {showPhotoTipsCopyButton && <button className="secondary" onClick={copyPhotoTips}>Copier les conseils photo</button>}
      <button onClick={resetSellForm}>Recommencer</button>
    </div>}
    {copiedMessage && <p className="copied">{copiedMessage}</p>}
  </div>;
}

function FlipMode({ onBack }) {
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
    if (!form.name.trim()) nextErrors.name = 'Merci de remplir les champs obligatoires avant l’analyse.';
    const ask = Number(form.ask);
    if (!form.ask || !Number.isFinite(ask) || ask <= 0) nextErrors.ask = 'Merci de remplir les champs obligatoires avant l’analyse.';
    if (!form.city.trim()) nextErrors.city = 'Merci de remplir les champs obligatoires avant l’analyse.';
    const minMargin = Number(form.minMargin);
    if (form.minMargin === '' || !Number.isFinite(minMargin) || minMargin < 0) nextErrors.minMargin = 'Merci de remplir les champs obligatoires avant l’analyse.';
    const costs = Number(form.costs);
    if (form.costs !== '' && (!Number.isFinite(costs) || costs < 0)) nextErrors.costs = 'Merci de remplir les champs obligatoires avant l’analyse.';
    const hours = Number(form.hours);
    if (form.hours !== '' && (!Number.isFinite(hours) || hours < 0)) nextErrors.hours = 'Merci de remplir les champs obligatoires avant l’analyse.';
    const localCount = Number(form.localCount);
    const localLow = Number(form.localLow);
    const localAvg = Number(form.localAvg);
    const localHigh = Number(form.localHigh);
    const hasLocalLow = form.localLow !== '';
    const hasLocalAvg = form.localAvg !== '';
    const hasLocalHigh = form.localHigh !== '';
    if (form.localCount !== '' && (!Number.isFinite(localCount) || localCount < 0)) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    if (hasLocalLow && (!Number.isFinite(localLow) || localLow < 0)) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    if (hasLocalAvg && (!Number.isFinite(localAvg) || localAvg < 0)) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    if (hasLocalHigh && (!Number.isFinite(localHigh) || localHigh < 0)) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    if (hasLocalLow && hasLocalAvg && localLow > localAvg) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    if (hasLocalAvg && hasLocalHigh && localAvg > localHigh) nextErrors.localCompetition = 'Vérifie les prix de concurrence : prix bas <= prix moyen <= prix haut.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const analyzeFlip = () => {
    if (!validateFlipForm()) return;
    setHasResult(true);
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
      <FormField label="Nombre d’annonces similaires" error={errors.localCompetition} invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localCount} onChange={(e)=>{updateFlipField('localCount', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      <FormField label="Prix le plus bas constaté" error={errors.localCompetition} invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localLow} onChange={(e)=>{updateFlipField('localLow', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      <FormField label="Prix moyen constaté" error={errors.localCompetition} invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localAvg} onChange={(e)=>{updateFlipField('localAvg', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
      <FormField label="Prix le plus haut constaté" error={errors.localCompetition} invalid={!!errors.localCompetition}><input type="number" min="0" value={form.localHigh} onChange={(e)=>{updateFlipField('localHigh', e.target.value); if (errors.localCompetition) setErrors({...errors,localCompetition:undefined});}}/></FormField>
    </section>
    {Object.keys(errors).length > 0 && <p className="form-error">Merci de remplir les champs obligatoires avant l’analyse.</p>}
    <div className="actions"><button className="primary" onClick={analyzeFlip}>Analyser le deal</button></div>
    {showResult && <FlipResult data={data} />}
    {showResult && <div className="actions"><button className="primary" onClick={copy}>Copier le message</button><button onClick={()=>{setForm({ name:'', category:categories[0], condition:conditions[1], ask:'', costs:'', hours:'', city:'', minMargin:'', localCount:'', localLow:'', localAvg:'', localHigh:'' }); setErrors({}); setHasResult(false);}}>Recommencer</button></div>}
    {copied && <p className="copied">Message copié ✅</p>}
  </div>;
}

const Header = ({ title, onBack }) => <div className="header"><button onClick={onBack}>← Retour accueil</button><h2>{title}</h2></div>;
const FormField = ({ label, hint, children, error, invalid }) => <label className={invalid ? 'field-error' : ''}>{label}{hint && <span className="field-hint">{hint}</span>}{children}{error && <span className="field-error-text">{error}</span>}</label>;

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

  let score = 50 + (coef * 35) + easeScore[ease];
  let marketRecommendation = 'Concurrence non renseignée : utilise les prix proposés et ajuste selon les retours.';

  if (form.objective === 'vendre vite') score += 3;
  if (form.objective === 'vendre au meilleur prix') score -= 2;

  const crowdedCategoryPenalty = lotCategories.has(form.category) ? 10 : 0;
  score -= crowdedCategoryPenalty;

  if (form.objective === 'vendre vite' && lotCategories.has(form.category)) score -= 3;

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
      marketRecommendation = lotCategories.has(form.category)
        ? 'Concurrence forte : prix attractif, bonnes photos et vente en lot recommandés.'
        : 'Concurrence forte : prix attractif, bonnes photos et titre plus précis recommandés.';
    }
  }

  if (Number.isFinite(localAvg) && localAvg > 0) {
    const ratioToLocalAvg = advised / localAvg;
    if (ratioToLocalAvg >= 1.25) {
      advised *= 0.93;
      high *= 0.96;
      score -= 6;
      marketRecommendation = localCompetitionLevel === 'forte'
        ? 'Concurrence forte et prix moyen local bas : privilégie un prix attractif, de bonnes photos et la vente en lot.'
        : 'Prix moyen local plus bas que ton estimation : pour vendre plus vite, rapproche-toi du marché ou vends en lot.';
    } else if (ratioToLocalAvg <= 0.8) {
      high = Math.max(high, localAvg * 1.05);
      score += 2;
      marketRecommendation = 'Le marché local semble plus haut que ton estimation : tu peux tester un prix légèrement plus ambitieux.';
    } else {
      marketRecommendation = 'Ton prix est cohérent avec le marché local.';
    }
  }

  if (Number.isFinite(localAvg) && Number.isFinite(localLow) && localAvg <= localLow * 1.12 && advised <= localAvg) {
    marketRecommendation = 'Prix local bas : attention à ne pas surestimer l’objet.';
  } else if (Number.isFinite(localAvg) && Number.isFinite(localHigh) && localHigh >= localAvg * 1.4) {
    marketRecommendation = advised > localAvg
      ? (localCompetitionLevel === 'forte'
        ? 'Concurrence forte et prix moyen local bas : privilégie un prix attractif, de bonnes photos et la vente en lot.'
        : 'Prix moyen local plus bas que ton estimation : pour vendre plus vite, rapproche-toi du marché ou vends en lot.')
      : 'Le marché local semble plus haut que ton estimation : tu peux tester un prix légèrement plus ambitieux.';
  }

  score = clamp(score);
  quick = advised * 0.8;

  let decision = 'PRIX CORRECT';
  if (form.objective === 'vendre vite') {
    if (lotCategories.has(form.category)) {
      decision = score >= 50 ? 'VENDS EN LOT' : 'BAISSE LE PRIX';
    } else {
      decision = score >= 60 ? 'VENDS VITE' : 'BAISSE LE PRIX';
    }
  } else if (form.objective === 'vendre au meilleur prix' && score >= 70) {
    decision = 'ATTENDS LE BON ACHETEUR';
  } else if (score >= 75) {
    decision = 'PRIX CORRECT';
  } else if (score >= 55) {
    decision = lotCategories.has(form.category) ? 'VENDS EN LOT' : 'VENDS VITE';
  } else {
    decision = 'BAISSE LE PRIX';
  }

  const strategy = lotCategories.has(form.category)
    ? 'Vends en lot de 3 ou 4 pour augmenter la valeur perçue et accélérer la vente.'
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
  const baseTitle = aiSellingTitle || form.name || 'Objet';
  const title = `${baseTitle} - ${form.condition} - disponible à ${cityLabel}`;
  const addLot = lotCategories.has(form.category) ? ' Possibilité de faire un prix pour un lot.' : '';
  const photoSentence = hasPhoto ? ' Photos disponibles dans l’annonce.' : '';
  const aiDescriptionSentence = aiDescription ? ` ${cleanMarketplaceDescription(aiDescription)}` : ` Idéal pour la catégorie ${form.category}.`;
  const description = `Je vends ${form.name || 'cet objet'}, en état ${form.condition}.${aiDescriptionSentence} Disponible à ${cityLabel}.${photoSentence} Prix raisonnable. Possibilité de venir voir sur place.${addLot}`;
  const level = ease === 'bon' || ease === 'bon mais risqué' ? 'facile à vendre' : ease;
  const observedMarketSummary = Number.isFinite(localLow) && Number.isFinite(localAvg) && Number.isFinite(localHigh)
    ? `Marché local observé : ${money(localLow)} à ${money(localHigh)}, moyenne ${money(localAvg)}.`
    : '';
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
    ? `Bonjour, votre annonce pour ${form.name || "nom de l’objet"} m’intéresse. Est-ce qu’elle est toujours disponible ? Si l’état est bien conforme à l’annonce, je peux venir le chercher rapidement.`
    : `Bonjour, votre annonce m’intéresse. Est-ce que vous accepteriez ${suggestedOffer} $ si je viens le chercher rapidement ?`;
 const maxBuyAdvice=!hasUsableMaxBuy
  ? 'Ce deal n’est pas rentable au prix actuel. Ne négocie que si le vendeur accepte un prix très bas.'
  : '';
 const marketRecommendation = localInsights[localInsights.length - 1] || 'Concurrence non renseignée : base-toi sur les marges et le risque du produit.';
 const observedMarketSummary = Number.isFinite(localLow) && Number.isFinite(localAvg) && Number.isFinite(localHigh)
  ? `Marché local observé : ${money(localLow)} à ${money(localHigh)}, moyenne ${money(localAvg)}.`
  : '';
 return {ask,costs,hours,timeCost,resale,gross,net,maxBuy,displayMaxBuy,displayOffer,maxBuyAdvice,score,risk,decision,strategy,negotiationMessage,ease,localCompetitionLevel,localAveragePrice:localAvg,observedMarketSummary,marketRecommendation};}

function SellResult({ data }) {const tone = data.decision.includes('BAISSE') ? 'bad' : data.decision.includes('LOT') || data.decision.includes('VITE') ? 'warn' : 'good'; return <article className={`result ${tone}`}>
  <h3>{data.decision}</h3><Score score={data.score} tone={tone}/><p className="score-note">{data.scoreHint}</p>
  <p><strong>Prix vente rapide:</strong> {money(data.quick)}</p><p><strong>Prix conseillé:</strong> {money(data.advised)}</p><p><strong>Prix haut:</strong> {money(data.high)}</p>
  <p><strong>Concurrence locale:</strong> {data.localCompetitionLevel}</p>{Number.isFinite(data.localAveragePrice) && <p><strong>Prix moyen local:</strong> {money(data.localAveragePrice)}</p>}{data.observedMarketSummary && <p><strong>Marché local observé:</strong> {data.observedMarketSummary.replace('Marché local observé : ','')}</p>}<p><strong>Recommandation marché:</strong> {data.marketRecommendation}</p>
  <p><strong>Niveau:</strong> {data.ease}</p><p><strong>Stratégie:</strong> {data.strategy}</p><p><strong>Titre:</strong> {data.title}</p><p><strong>Description:</strong> {data.description}</p>
  {Array.isArray(data.aiPhotoTips) && data.aiPhotoTips.length > 0 && <div><strong>Conseils photo IA:</strong><ul>{data.aiPhotoTips.map((tip, index) => <li key={`${tip}-${index}`}>{tip}</li>)}</ul></div>}
  {data.aiSellingAdvice && <p><strong>Conseil de mise en vente IA:</strong> {data.aiSellingAdvice}</p>}
  {data.aiWarning && <p><strong>Avertissement IA:</strong> {data.aiWarning}</p>}
</article>; }

function FlipResult({ data }) {const tone = data.decision==='ACHÈTE' ? 'good' : data.decision==='NÉGOCIE' ? 'warn' : 'bad'; return <article className={`result ${tone}`}>
  <h3>{data.decision}</h3><Score score={data.score} tone={tone}/>
  {data.decision==='ACHÈTE'
    ? <><p><strong>Prix demandé:</strong> {money(data.ask)}</p><p><strong>Prix demandé correct</strong></p></>
    : data.decision==='LAISSE TOMBER'
      ? <p><strong>Prix de négociation conseillé:</strong> Non rentable</p>
      : <><p><strong>Prix max théorique:</strong> {data.displayMaxBuy}</p><p><strong>Prix de négociation conseillé:</strong> {data.displayOffer}</p></>}
  <p><strong>Prix revente probable:</strong> {money(data.resale)}</p><p><strong>Marge brute:</strong> {money(data.gross)}</p><p><strong>Marge nette:</strong> {money(data.net)}</p><p><strong>Frais estimés:</strong> {money(data.costs)}</p><p><strong>Temps estimé:</strong> {data.hours} h</p><p><strong>Coût temps estimé:</strong> {money(data.timeCost)}</p>
  <p><strong>Risque:</strong> {data.risk}</p><p><strong>Facilité revente:</strong> {data.ease}</p><p><strong>Concurrence locale:</strong> {data.localCompetitionLevel}</p>{Number.isFinite(data.localAveragePrice) && <p><strong>Prix moyen local:</strong> {money(data.localAveragePrice)}</p>}{data.observedMarketSummary && <p><strong>Marché local observé:</strong> {data.observedMarketSummary.replace('Marché local observé : ','')}</p>}<p><strong>Recommandation marché:</strong> {data.marketRecommendation}</p><p><strong>Conseil:</strong> {data.strategy}</p>{data.maxBuyAdvice && <p><strong>Note:</strong> {data.maxBuyAdvice}</p>}<p><strong>Message:</strong> {data.negotiationMessage}</p>
</article>; }

const Score = ({ score, tone: forcedTone }) => {
  const tone = forcedTone ?? (score >= 75 ? 'good' : score >= 55 ? 'warn' : 'bad');
  return <div className="score-block"><div className={`score ${tone}`}><div className="bar" style={{width:`${score}%`}} /></div><p className="score-label">Score {Math.round(score)}/100</p></div>;
};

export default App;
