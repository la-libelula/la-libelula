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
      return res.status(500).json({ error: 'La clave GEMINI_API_KEY no está configurada en las variables de entorno de Vercel.' });
    }

    const prompt = `Analiza la imagen de este documento de identidad (DNI, NIE, Pasaporte) de forma extremadamente precisa y extrae los datos en el siguiente formato JSON.
Instrucciones críticas:
1. Identifica el tipo de documento: "NIF" (para DNI de España), "NIE" (para extranjeros en España), "PAS" (para Pasaporte) o "OTRO".
2. Extrae el "nombre", "apellido1" (primer apellido) y "apellido2" (segundo apellido, si existe y no es igual al primero). Ponlos en MAYÚSCULAS y limpios de acentos si es posible, o respeta su ortografía.
3. Extrae el número de documento ("numeroDocumento"). Para DNI español, debe ser de 9 caracteres (8 números y una letra de control, ej: 12345678A). Para NIE español, debe empezar por X, Y o Z seguido de 7 números y una letra.
4. Para DNI español (NIF), localiza el número de soporte o de control ("soporteDocumento"). Suele encontrarse en la parte delantera (bajo la fecha de nacimiento en el DNI 3.0/4.0 o arriba a la derecha en modelos anteriores). Suele constar de 3 letras seguidas de 6 números (ej: AAA123456) o un formato similar. Es fundamental para SES.HOSPEDAJES.
5. La fecha de nacimiento ("fechaNacimiento") debe formatearse como AAAA-MM-DD.
6. El sexo ("sexo") debe ser "H" (Hombre), "M" (Mujer) o "O" (Otro/No especificado).
7. Si la dirección de la persona ("direccion"), código postal ("codigoPostal"), o el municipio/provincia ("municipio") son visibles (por ejemplo, en la parte trasera del DNI o en el documento), extráelos.
8. El campo "pais" debe ser el código ISO de 3 letras del país emisor (ej: "ESP" para España, "FRA" para Francia, "DEU" para Alemania, etc.).
9. Devuelve ÚNICAMENTE el bloque JSON crudo sin formato markdown, sin envolverlo en triple comilla invertida (\`\`\`json ... \`\`\`), sin texto adicional, de modo que pueda ser parseado directamente con JSON.parse().

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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
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
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Error de la API de Gemini: ${errText}` });
    }

    const data = await response.json();
    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;

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
      console.error('Error parseando JSON de Gemini:', cleanJsonText);
      return res.status(500).json({
        error: 'El modelo no devolvió un formato JSON válido.',
        rawText: textOutput
      });
    }
  } catch (err) {
    console.error('Error en la función de escaneo:', err);
    return res.status(500).json({ error: `Error del servidor: ${err.message}` });
  }
}
