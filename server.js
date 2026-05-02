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
              text: `Analyse cette photo d'objet à vendre. Retourne uniquement un JSON strict avec: objectName, category, condition, keywords, description, confidence, warning, shortTitle, sellingTitle, shortDescription, detailedDescription, photoTips, sellingAdvice.\nCatégories autorisées: ${allowedCategories.join(', ')}.\nÉtats autorisés: ${allowedConditions.join(', ')}.\nConfiance autorisée: ${allowedConfidence.join(', ')}.\nRègles: si incertain catégorie=autre et confidence=faible; ne pas inventer marque; ne jamais affirmer neuf uniquement depuis photo; état apparent uniquement; warning doit toujours rappeler confirmation manuelle; ne pas inventer de détail non visible; shortDescription et detailedDescription doivent être prêtes à publier sur Marketplace, naturelles, simples et vendeuses; ne pas inclure dans shortDescription, detailedDescription ni description de mentions d'avertissement, juridiques ou de doute (ex: "vérifiez", "confirmez", "je ne garantis pas", "sous réserve", "authenticité", "matériaux à confirmer"), sauf nécessité absolue pour objet de luxe/de marque; mettre les prudences et avertissements uniquement dans warning et/ou sellingAdvice; photoTips doit être un tableau de 0 à 5 conseils utiles; sellingAdvice doit rester prudent et réaliste; parler d'authenticité, de garantie ou de vérification des matériaux uniquement si l'objet semble être un bijou précieux, une montre, un sac de marque, un vêtement de luxe, un téléphone, de l'électronique chère ou un objet de collection; pour un bijou fantaisie ou un objet simple, privilégier des conseils pratiques (vendre en lot, préciser les dimensions, montrer l'objet porté, ajouter des photos en gros plan, préciser l'état réel); éviter un ton juridique; garder un style simple, vendeur et naturel pour une annonce Marketplace.`
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
      sellingAdvice: typeof parsed.sellingAdvice === 'string' ? parsed.sellingAdvice : ''
    };

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
