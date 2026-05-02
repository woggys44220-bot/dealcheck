import { useMemo, useState } from 'react';

const categories = ['bijoux', 'meuble', 'électroménager', 'outil', 'pièce auto', 'vêtement', 'téléphone', 'déco', 'jouet', 'sport', 'autre'];
const conditions = ['neuf', 'très bon', 'bon', 'correct', 'abîmé'];
const objectives = ['vendre vite', 'prix équilibré', 'vendre au meilleur prix'];

const conditionCoef = { neuf: 0.85, 'très bon': 0.7, bon: 0.55, correct: 0.4, abîmé: 0.25 };
const easeByCategory = {
  bijoux: 'moyen', meuble: 'moyen', 'électroménager': 'bon', outil: 'bon', 'pièce auto': 'niche', vêtement: 'difficile', téléphone: 'bon mais risqué', déco: 'moyen', jouet: 'moyen', sport: 'bon', autre: 'moyen'
};
const easeScore = { bon: 15, moyen: 5, difficile: -15, niche: -5, 'bon mais risqué': 5 };
const categoryResaleMultiplier = { bijoux: 1.25, meuble: 1.2, 'électroménager': 1.28, outil: 1.32, 'pièce auto': 1.22, vêtement: 1.15, téléphone: 1.27, déco: 1.18, jouet: 1.2, sport: 1.3, autre: 1.2 };
const lotCategories = new Set(['bijoux', 'vêtement', 'jouet', 'déco']);

const money = (n) => `${(Number.isFinite(n) ? n : 0).toFixed(2)} $`;
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));

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
  const [form, setForm] = useState({ name: '', category: categories[0], condition: conditions[1], value: '', city: '', objective: objectives[0] });
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState({});
  const [hasResult, setHasResult] = useState(false);
  const data = useMemo(() => computeSell(form), [form]);

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
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const analyzeSell = () => {
    if (!validateSellForm()) return;
    setHasResult(true);
  };

  const showResult = hasResult;
  const copy = async () => {
    if (!showResult) return;
    await navigator.clipboard.writeText(`${data.title}\n\n${data.description}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return <div>
    <Header title="Mode vente" onBack={onBack} />
    <FormField label="Nom de l’objet" error={errors.name} invalid={!!errors.name}><input value={form.name} onChange={(e)=>{updateSellField('name', e.target.value); if (errors.name) setErrors({...errors,name:undefined});}}/></FormField>
    <FormField label="Catégorie"><select value={form.category} onChange={(e)=>updateSellField('category', e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></FormField>
    <FormField label="État"><select value={form.condition} onChange={(e)=>updateSellField('condition', e.target.value)}>{conditions.map(c=><option key={c}>{c}</option>)}</select></FormField>
    <FormField label="Valeur estimée / prix d’achat initial" error={errors.value} invalid={!!errors.value}><input type="number" min="0" value={form.value} onChange={(e)=>{updateSellField('value', e.target.value); if (errors.value) setErrors({...errors,value:undefined});}}/></FormField>
    <FormField label="Ville / région" error={errors.city} invalid={!!errors.city}><input value={form.city} onChange={(e)=>{updateSellField('city', e.target.value); if (errors.city) setErrors({...errors,city:undefined});}}/></FormField>
    <FormField label="Objectif"><select value={form.objective} onChange={(e)=>updateSellField('objective', e.target.value)}>{objectives.map(o=><option key={o}>{o}</option>)}</select></FormField>
    {(errors.form || errors.name || errors.value || errors.city) && <p className="form-error">Merci de remplir les champs obligatoires avant l’analyse.</p>}
    <div className="actions"><button className="primary" onClick={analyzeSell}>Analyser mon objet</button></div>
    {showResult && <SellResult data={data} />}
    {showResult && <div className="actions"><button className="primary" onClick={copy}>Copier l’annonce</button><button onClick={()=>{setForm({ name: '', category: categories[0], condition: conditions[1], value: '', city: '', objective: objectives[0] }); setErrors({}); setHasResult(false);}}>Recommencer</button></div>}
    {copied && <p className="copied">Annonce copiée ✅</p>}
  </div>;
}

function FlipMode({ onBack }) {
  const [form, setForm] = useState({ name:'', category:categories[0], condition:conditions[1], ask:'', costs:'', hours:'', city:'', minMargin:'' });
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
    {Object.keys(errors).length > 0 && <p className="form-error">Merci de remplir les champs obligatoires avant l’analyse.</p>}
    <div className="actions"><button className="primary" onClick={analyzeFlip}>Analyser le deal</button></div>
    {showResult && <FlipResult data={data} />}
    {showResult && <div className="actions"><button className="primary" onClick={copy}>Copier le message</button><button onClick={()=>{setForm({ name:'', category:categories[0], condition:conditions[1], ask:'', costs:'', hours:'', city:'', minMargin:'' }); setErrors({}); setHasResult(false);}}>Recommencer</button></div>}
    {copied && <p className="copied">Message copié ✅</p>}
  </div>;
}

const Header = ({ title, onBack }) => <div className="header"><button onClick={onBack}>← Retour accueil</button><h2>{title}</h2></div>;
const FormField = ({ label, hint, children, error, invalid }) => <label className={invalid ? 'field-error' : ''}>{label}{hint && <span className="field-hint">{hint}</span>}{children}{error && <span className="field-error-text">{error}</span>}</label>;

function computeSell(form) {
  const base = Number(form.value) || 0;
  const coef = conditionCoef[form.condition];
  const advised = base * coef;
  const quick = advised * 0.8;
  const high = advised * 1.25;
  const ease = easeByCategory[form.category];

  let score = 50 + (coef * 35) + easeScore[ease];

  if (form.objective === 'vendre vite') score += 3;
  if (form.objective === 'vendre au meilleur prix') score -= 2;

  const crowdedCategoryPenalty = lotCategories.has(form.category) ? 10 : 0;
  score -= crowdedCategoryPenalty;

  if (form.objective === 'vendre vite' && lotCategories.has(form.category)) score -= 3;

  score = clamp(score);

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

  const title = `${form.name || 'Objet'} - ${form.condition} - disponible à ${form.city || 'votre ville'}`;
  const addLot = lotCategories.has(form.category) ? ' Possibilité de faire un prix pour un lot.' : '';
  const description = `Je vends ${form.name || 'cet objet'}, en état ${form.condition}. Idéal pour la catégorie ${form.category}. Disponible à ${form.city || 'votre ville'}. Prix raisonnable. Possibilité de venir voir sur place.${addLot}`;
  const level = ease === 'bon' || ease === 'bon mais risqué' ? 'facile à vendre' : ease;
  return { quick, advised, high, score, ease: level, strategy, decision, title, description, scoreHint };
}

function computeFlip(form){const ask=Number(form.ask)||0; const costs=Number(form.costs)||0; const hours=Number(form.hours)||0; const minMargin=Number(form.minMargin)||0; const timeCost=hours*5; const resale=ask*categoryResaleMultiplier[form.category]*(1+conditionCoef[form.condition]*0.3); const gross=resale-ask; const net=resale-ask-costs-timeCost; const maxBuy=resale-costs-timeCost-minMargin; const ease=easeByCategory[form.category]; const risk = form.condition==='abîmé' || ease==='difficile' || form.category==='téléphone' ? 'élevé' : ease==='niche' ? 'moyen' : 'faible';
 const roundedMaxBuy=Math.floor(maxBuy); const hasUsableMaxBuy=maxBuy>=5;
 let decision='ACHÈTE'; let strategy=''; let score=75;
 if(net<=0){decision='LAISSE TOMBER'; score=clamp(20+Math.max(net,-25),0,40); strategy='Marge nette négative : après frais et temps passé, ce deal ne vaut pas le coup.';}
 else if(net<minMargin){decision='NÉGOCIE'; const progress=minMargin>0?net/minMargin:0.5; score=clamp(45+progress*25,45,70); strategy='Marge possible, mais elle devient faible après frais et temps passé. Négocie plus bas.';}
 else {decision='ACHÈTE'; const surplus=net-minMargin; score=clamp(75+surplus*0.8+(risk==='faible'?4:0),75,100); strategy='Marge nette suffisante : bon deal si l’état réel est confirmé.';}
 const realisticRange=ease==='bon'?[0.7,0.8]:[0.6,0.85];
 const suggestedOffer=Math.round(ask*((realisticRange[0]+realisticRange[1])/2));
 const displayMaxBuy=hasUsableMaxBuy?`${roundedMaxBuy} $`:'Non rentable';
 const displayOffer=decision==='NÉGOCIE'?`${suggestedOffer} $`:decision==='ACHÈTE'?'Prix demandé correct':'Non rentable';
 const negotiationMessage = decision==='LAISSE TOMBER'
  ? 'Non rentable'
  : decision==='ACHÈTE'
    ? `Bonjour, votre annonce m’intéresse. Je peux l’acheter à votre prix demandé de ${money(ask)} si l’état est bien conforme.`
    : `Bonjour, votre annonce m’intéresse. Est-ce que vous accepteriez ${suggestedOffer} $ si je viens le chercher rapidement ?`;
 const maxBuyAdvice=!hasUsableMaxBuy
  ? 'Ce deal n’est pas rentable au prix actuel. Ne négocie que si le vendeur accepte un prix très bas.'
  : '';
 return {ask,costs,hours,timeCost,resale,gross,net,maxBuy,displayMaxBuy,displayOffer,maxBuyAdvice,score,risk,decision,strategy,negotiationMessage,ease};}

function SellResult({ data }) {const tone = data.decision.includes('BAISSE') ? 'bad' : data.decision.includes('LOT') || data.decision.includes('VITE') ? 'warn' : 'good'; return <article className={`result ${tone}`}>
  <h3>{data.decision}</h3><Score score={data.score} tone={tone}/><p className="score-note">{data.scoreHint}</p>
  <p><strong>Prix vente rapide:</strong> {money(data.quick)}</p><p><strong>Prix conseillé:</strong> {money(data.advised)}</p><p><strong>Prix haut:</strong> {money(data.high)}</p>
  <p><strong>Niveau:</strong> {data.ease}</p><p><strong>Stratégie:</strong> {data.strategy}</p><p><strong>Titre:</strong> {data.title}</p><p><strong>Description:</strong> {data.description}</p>
</article>; }

function FlipResult({ data }) {const tone = data.decision==='ACHÈTE' ? 'good' : data.decision==='NÉGOCIE' ? 'warn' : 'bad'; return <article className={`result ${tone}`}>
  <h3>{data.decision}</h3><Score score={data.score} tone={tone}/>
  <p><strong>Prix max théorique:</strong> {data.displayMaxBuy}</p><p><strong>Prix de négociation conseillé:</strong> {data.displayOffer}</p><p><strong>Prix revente probable:</strong> {money(data.resale)}</p><p><strong>Marge brute:</strong> {money(data.gross)}</p><p><strong>Marge nette:</strong> {money(data.net)}</p><p><strong>Frais estimés:</strong> {money(data.costs)}</p><p><strong>Temps estimé:</strong> {data.hours} h</p><p><strong>Coût temps estimé:</strong> {money(data.timeCost)}</p>
  <p><strong>Risque:</strong> {data.risk}</p><p><strong>Facilité revente:</strong> {data.ease}</p><p><strong>Conseil:</strong> {data.strategy}</p>{data.maxBuyAdvice && <p><strong>Note:</strong> {data.maxBuyAdvice}</p>}<p><strong>Message:</strong> {data.negotiationMessage}</p>
</article>; }

const Score = ({ score, tone: forcedTone }) => {
  const tone = forcedTone ?? (score >= 75 ? 'good' : score >= 55 ? 'warn' : 'bad');
  return <div className="score-block"><div className={`score ${tone}`}><div className="bar" style={{width:`${score}%`}} /></div><p className="score-label">Score {Math.round(score)}/100</p></div>;
};

export default App;
