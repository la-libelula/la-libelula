import https from 'https';

export default async function handler(req, res) {
  // Configuración de cabeceras CORS para permitir peticiones desde el formulario de autocheckin
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Utilizar POST.' });
  }

  try {
    const { image, mimeType } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Falta la imagen en el cuerpo de la petición.' });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const finalMimeType = mimeType || 'image/jpeg';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'La clave GEMINI_API_KEY no está configurada.' });
    }

    const prompt = `Analiza la imagen de este documento de identidad (DNI, NIE, Pasaporte) de forma extremadamente precisa y extrae los datos en el siguiente formato JSON.
Instrucciones críticas:
1. Identifica el tipo de documento: "NIF" (para DNI de España), "NIE" (para extranjeros en España), "PAS" (para Pasaporte) o "OTRO".
2. Extrae el "nombre", "apellido1" (primer apellido) y "apellido2" (segundo apellido, si existe y no es igual al primero). Ponlos en MAYÚSCULAS y limpios de acentos.
3. Extrae el número de documento ("numeroDocumento"). Para DNI, debe ser de 9 caracteres (8 números y una letra). Para NIE, debe empezar por X, Y o Z, seguido de 7 números y una letra.
4. Para DNI español (NIF), localiza el número de soporte o de control ("soporteDocumento"). Suele empezar con 3 letras y 6 números (ej: AAA123456). Es fundamental para SES.HOSPEDAJES.
5. La fecha de nacimiento ("fechaNacimiento") debe formatearse como AAAA-MM-DD.
6. El sexo ("sexo") debe ser "H" (Hombre), "M" (Mujer) o "O" (Otro).
7. Si la dirección de la persona ("direccion"), código postal ("codigoPostal"), o el municipio/provincia ("municipio") son visibles, extráelos.
8. El campo "pais" debe ser el código ISO de 3 letras del país emisor (ej: "ESP").
9. Devuelve ÚNICAMENTE el bloque JSON crudo sin formato markdown, sin envolverlo en triple comilla invertida, sin texto adicional.

Estructura requerida:
{
  "nombre": "",
  "apellido1": "",
  "apellido2": "",
  "tipoDocumento": "NIF" | "NIE" | "PAS" | "OTRO",
  "numeroDocumento": "",
  "soporteDocumento": "",
  "fechaNacimiento": "",
  "sexo": "H" | "M" | "O",
  "direccion": "",
  "codigoPostal": "",
  "municipio": "",
  "pais": "ESP"
}`;

    const postData = JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: finalMimeType,
                data: base64Data
              }
            }
          ]
        }
      ]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const callGemini = () => {
      return new Promise((resolve, reject) => {
        const reqGem = https.request(options, (resGem) => {
          let data = '';
          resGem.on('data', (chunk) => {
            data += chunk;
          });
          resGem.on('end', () => {
            resolve({ statusCode: resGem.statusCode, data });
          });
        });

        reqGem.on('error', (e) => {
          reject(e);
        });

        reqGem.write(postData);
        reqGem.end();
      });
    };

    const geminiResult = await callGemini();

    if (geminiResult.statusCode < 200 || geminiResult.statusCode >= 300) {
      return res.status(geminiResult.statusCode).json({ error: `Error de la API de Gemini (Código ${geminiResult.statusCode}): ${geminiResult.data}` });
    }

    const responseData = JSON.parse(geminiResult.data);
    const textOutput = responseData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textOutput) {
      return res.status(500).json({ error: 'La API de Gemini no devolvió ningún contenido útil.' });
    }

    const cleanJsonText = textOutput
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    try {
      const parsedData = JSON.parse(cleanJsonText);
      return res.status(200).json(parsedData);
    } catch (parseError) {
      return res.status(500).json({
        error: 'El modelo no devolvió un formato JSON válido.',
        rawText: textOutput
      });
    }
  } catch (err) {
    return res.status(500).json({ error: `Error del servidor: ${err.message}` });
  }
}
