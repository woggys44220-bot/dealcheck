import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI from 'openai';

const app = express();
const upload = multer({ limits: { fileSize: 8 * 1024 * 1024 } });
const port = process.env.PORT || 8787;

const allowedCategories = ['bijoux', 'meuble', 'électroménager', 'outil', 'pièce auto', 'vêtement', 'téléphone', 'déco', 'jouet', 'sport', 'autre'];
const allowedConditions = ['neuf', 'très bon', 'bon', 'correct', 'abîmé'];
const allowedConfidence = ['faible', 'moyenne', 'élevée'];

app.use(cors());

function extractJsonFromAiText(rawText) {
  const text = String(rawText || '');
  let cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned.trim();
}

app.post('/api/analyze-photo', upload.single('photo'), async (req, res) => {
  console.log('Requête analyse photo reçue');
  const hasFile = Boolean(req.file);
  const mimeType = req.file?.mimetype || 'absent';
  const fileSize = req.file?.size || 0;
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
  const model = 'gpt-4.1-mini';
  const imageType = req.body?.imageType === 'marketplace_screenshot' ? 'marketplace_screenshot' : 'object_photo';
  console.log('Analyse photo: fichier reçu =', hasFile);
  console.log('Analyse photo: type MIME =', mimeType);
  console.log('Analyse photo: taille fichier (octets) =', fileSize);
  console.log(`Analyse photo: OPENAI_API_KEY ${hasApiKey ? 'présente' : 'absente'}`);
  console.log('Analyse photo: modèle utilisé =', model);
  try {
    if (!hasApiKey) {
      return res.status(503).json({ error: 'OPENAI_API_KEY manquante.' });
    }

    if (!req.file || !req.file.mimetype?.startsWith('image/')) {
      return res.status(400).json({ error: 'Image invalide.' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const imageBase64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${imageBase64}`;

    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: imageType === 'marketplace_screenshot'
                ? `Analyse cette capture d’annonce Marketplace/Kijiji/Vinted/Leboncoin. Lis explicitement le texte visible dans la capture et n’utilise que ce qui est lisible. Retourne uniquement un JSON strict avec: imageType, objectName, visibleListingTitle, detectedPrice, detectedCity, category, condition, brandOrModel, visibleDescription, keywords, risksToCheck, questionsToAsk, accessoriesToCheck, confidence, warning, description.\nimageType doit être marketplace_screenshot.\nCatégories autorisées: ${allowedCategories.join(', ')}.\nÉtats autorisés: ${allowedConditions.join(', ')}.\nConfiance autorisée: ${allowedConfidence.join(', ')}.\nRègles critiques: détecte le prix affiché s’il est lisible (nombre uniquement dans detectedPrice), détecte la ville/région affichée si lisible, détecte le titre exact de l’annonce si lisible, détecte état/catégorie uniquement si visibles; n’invente jamais prix/ville/marque/titre non lisibles (mettre null ou chaîne vide), n’invente pas une description non visible, si texte flou ou partiel confidence=faible ou moyenne, indique clairement ce qui est visible, warning doit rappeler la vérification manuelle avant achat, risquesToCheck/questionsToAsk/accessoriesToCheck en tableaux courts et utiles.`
                : `Analyse cette photo d'objet. Retourne uniquement un JSON strict avec: objectName, category, condition, keywords, description, confidence, warning, shortTitle, sellingTitle, shortDescription, detailedDescription, photoTips, sellingAdvice, risksToCheck, questionsToAsk, accessoriesToCheck.\nCatégories autorisées: ${allowedCategories.join(', ')}.\nÉtats autorisés: ${allowedConditions.join(', ')}.\nConfiance autorisée: ${allowedConfidence.join(', ')}.\nRègles: si incertain catégorie=autre et confidence=faible; ne pas inventer marque; ne jamais affirmer neuf uniquement depuis photo; état apparent uniquement; warning doit toujours rappeler confirmation manuelle; ne pas inventer de détail non visible; shortDescription et detailedDescription doivent être prêtes à publier sur Marketplace, naturelles, simples et vendeuses; ne pas inclure dans shortDescription, detailedDescription ni description de mentions d'avertissement, juridiques ou de doute (ex: "vérifiez", "confirmez", "je ne garantis pas", "sous réserve", "authenticité", "matériaux à confirmer"), sauf nécessité absolue pour objet de luxe/de marque; mettre les prudences et avertissements uniquement dans warning et/ou sellingAdvice; photoTips doit être un tableau de 0 à 5 conseils utiles; sellingAdvice doit rester prudent et réaliste; risksToCheck, questionsToAsk et accessoriesToCheck doivent être des tableaux courts et pratiques; éviter un ton juridique; garder un style simple, vendeur et naturel.`
            },
            { type: 'input_image', image_url: dataUrl }
          ]
        }
      ]
    });

    const raw = response.output_text || '{}';
    console.log('Analyse photo: réponse IA brute reçue');
    const cleanedJson = extractJsonFromAiText(raw);
    console.log('Analyse photo: JSON nettoyé avant parsing', cleanedJson);

    let parsed;
    try {
      parsed = JSON.parse(cleanedJson);
      console.log('Analyse photo: parsing JSON réussi');
    } catch (parseError) {
      console.error('Analyse photo: erreur de parsing JSON', parseError);
      console.error('Analyse photo: réponse brute', raw);
      console.error('Analyse photo: JSON nettoyé', cleanedJson);
      return res.status(500).json({ error: 'Réponse IA invalide' });
    }

    const safe = {
      objectName: typeof parsed.objectName === 'string' ? parsed.objectName : 'objet non certain',
      category: allowedCategories.includes(parsed.category) ? parsed.category : 'autre',
      condition: allowedConditions.includes(parsed.condition) ? parsed.condition : 'correct',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8).map((k) => String(k)) : [],
      description: typeof parsed.description === 'string' ? parsed.description : 'Description à compléter manuellement.',
      confidence: allowedConfidence.includes(parsed.confidence) ? parsed.confidence : 'faible',
      warning: typeof parsed.warning === 'string' ? parsed.warning : 'L’état exact doit être confirmé manuellement.',
      shortTitle: typeof parsed.shortTitle === 'string' ? parsed.shortTitle : '',
      sellingTitle: typeof parsed.sellingTitle === 'string' ? parsed.sellingTitle : '',
      shortDescription: typeof parsed.shortDescription === 'string' ? parsed.shortDescription : '',
      detailedDescription: typeof parsed.detailedDescription === 'string' ? parsed.detailedDescription : '',
      photoTips: Array.isArray(parsed.photoTips) ? parsed.photoTips.slice(0, 5).map((tip) => String(tip)) : [],
      sellingAdvice: typeof parsed.sellingAdvice === 'string' ? parsed.sellingAdvice : '',
      risksToCheck: Array.isArray(parsed.risksToCheck) ? parsed.risksToCheck.slice(0, 6).map((v) => String(v)) : [],
      questionsToAsk: Array.isArray(parsed.questionsToAsk) ? parsed.questionsToAsk.slice(0, 6).map((v) => String(v)) : [],
      accessoriesToCheck: Array.isArray(parsed.accessoriesToCheck) ? parsed.accessoriesToCheck.slice(0, 6).map((v) => String(v)) : []
    };
    safe.imageType = imageType;
    const detectedPriceRaw = typeof parsed.detectedPrice === 'string' ? parsed.detectedPrice.replace(',', '.').replace(/[^0-9.]/g, '') : parsed.detectedPrice;
    safe.detectedPrice = Number.isFinite(Number(detectedPriceRaw)) ? Number(detectedPriceRaw) : null;
    safe.detectedCity = typeof parsed.detectedCity === 'string' ? parsed.detectedCity.trim() : '';
    safe.brandOrModel = typeof parsed.brandOrModel === 'string' ? parsed.brandOrModel.trim() : '';
    safe.visibleListingTitle = typeof parsed.visibleListingTitle === 'string' ? parsed.visibleListingTitle.trim() : '';
    safe.visibleDescription = typeof parsed.visibleDescription === 'string' ? parsed.visibleDescription.trim() : '';

    if (!safe.warning.toLowerCase().includes('manuell')) {
      safe.warning = `${safe.warning} L’état exact doit être confirmé manuellement.`.trim();
    }

    res.json(safe);
  } catch (error) {
    console.error('Analyse photo: erreur OpenAI complète', error);
    res.status(500).json({ error: 'Analyse indisponible.' });
  }
});

app.listen(port, () => {
  console.log(`DealCheck backend running on http://localhost:${port}`);
});
