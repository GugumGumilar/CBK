import { GoogleGenAI, Type } from '@google/genai';

export interface ParsedReceiptItem {
  name: string;
  qty: number;
  unit: string;
  price: number;
  total: number;
  category: string;
}

export interface ParsedReceipt {
  storeName: string;
  date: string;       // YYYY-MM-DD
  time?: string;      // HH:mm
  items: ParsedReceiptItem[];
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  paymentMethod?: string;
  rawNotes?: string;
}

let aiClient: GoogleGenAI | null = null;

function getAi(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing. Please configure GEMINI_API_KEY in the environment or Secrets.');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * Executes a Gemini request with instant graceful fallback across supported models
 * to handle temporary regional high-demand spikes (503 / 429) seamlessly.
 */
async function executeWithFallback<T>(
  taskName: string,
  fn: (ai: GoogleGenAI, modelName: string) => Promise<T>
): Promise<T> {
  const ai = getAi();

  // Try stable flash alias first, followed by specific versions
  const candidateModels = [
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
  ];

  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      return await fn(ai, model);
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || err);
      const isTransient =
        errMsg.includes('503') ||
        errMsg.includes('UNAVAILABLE') ||
        errMsg.includes('high demand') ||
        errMsg.includes('429') ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        err?.status === 503 ||
        err?.code === 503;

      if (isTransient) {
        // Fall through quietly to next candidate model without noisy stderr logs
        continue;
      } else {
        // For non-transient errors (e.g. invalid arguments), break immediately
        break;
      }
    }
  }

  // If all candidate models were unavailable
  const finalMsg = lastError?.message || String(lastError);
  if (
    finalMsg.includes('503') ||
    finalMsg.includes('high demand') ||
    finalMsg.includes('UNAVAILABLE')
  ) {
    throw new Error(
      'Layanan AI Google sedang mengalami lonjakan beban sementara (503). Silakan ulangi dalam beberapa saat atau gunakan Input Manual.'
    );
  }

  throw new Error(`Gagal memproses AI (${taskName}): ${finalMsg}`);
}

/**
 * Perform automatic OCR on receipt photo using Gemini with multi-model fallback
 */
export async function parseReceiptImage(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<ParsedReceipt> {
  const prompt = `Anda adalah asisten AI spesialis OCR dan ekstraksi data struk/bon belanjaan di Indonesia (Indomaret, Alfamart, Superindo, Hypermart, Pasar Tradisional, Toko Kelontong, dll).
Tugas Anda:
1. Baca foto struk/bon belanjaan ini secara teliti.
2. Ekstrak nama toko (storeName), tanggal (format YYYY-MM-DD), jam (format HH:mm jika ada).
3. Ekstrak setiap baris item belanja:
   - name: Nama barang yang bersih dan jelas (jangan cantumkan barcode acak, singkatan struk yang tidak perlu rapikan jadi nama yang mudah dimengerti).
   - qty: Jumlah barang yang dibeli (angka desimal atau bulat).
   - unit: Satuan seperti 'pcs', 'kg', 'ikat', 'bungkus', 'botol', 'kotak', dll.
   - price: Harga satuan per barang dalam Rupiah (angka bulat).
   - total: Total harga untuk baris item tersebut (angka bulat).
   - category: Klasifikasikan ke salah satu: 'Sembako', 'Sayuran & Buah', 'Daging & Ikan', 'Bumbu & Minyak', 'Makanan & Minuman', 'Kebutuhan Rumah', atau 'Lain-lain'.
4. Ekstrak subtotal, diskon/potongan harga (jika ada), pajak/PPN (jika ada), dan grandTotal (total akhir pembayaran).
5. Ekstrak metode pembayaran (misal 'Tunai', 'QRIS', 'Debit BCA', 'Gopay', dll jika terlihat).
6. Jika ada angka tanggal yang tidak jelas, gunakan tanggal hari ini: ${new Date().toISOString().split('T')[0]}.

Pastikan semua nilai numerik adalah angka (number), bukan string dengan format titik/koma.`;

  const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

  return executeWithFallback('Receipt-OCR', async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: cleanBase64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            storeName: { type: Type.STRING, description: 'Nama toko atau supermarket' },
            date: { type: Type.STRING, description: 'Tanggal belanja format YYYY-MM-DD' },
            time: { type: Type.STRING, description: 'Waktu belanja HH:mm jika tertera' },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: 'Nama barang belanjaan' },
                  qty: { type: Type.NUMBER, description: 'Jumlah' },
                  unit: { type: Type.STRING, description: 'Satuan' },
                  price: { type: Type.NUMBER, description: 'Harga satuan' },
                  total: { type: Type.NUMBER, description: 'Total harga item' },
                  category: { type: Type.STRING, description: 'Kategori barang' },
                },
                required: ['name', 'qty', 'unit', 'price', 'total', 'category'],
              },
            },
            subtotal: { type: Type.NUMBER, description: 'Subtotal' },
            discount: { type: Type.NUMBER, description: 'Potongan atau diskon' },
            tax: { type: Type.NUMBER, description: 'PPN atau pajak' },
            grandTotal: { type: Type.NUMBER, description: 'Total pembayaran akhir' },
            paymentMethod: { type: Type.STRING, description: 'Metode pembayaran' },
            rawNotes: { type: Type.STRING, description: 'Catatan tambahan dari struk' },
          },
          required: ['storeName', 'date', 'items', 'grandTotal'],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Respons AI kosong saat membaca struk.');
    }

    const parsed: ParsedReceipt = JSON.parse(text);

    // Ensure items have proper total calculation if zero
    parsed.items = (parsed.items || []).map(item => {
      const qty = item.qty || 1;
      const price = item.price || 0;
      const total = item.total || (qty * price);
      return {
        ...item,
        qty,
        price,
        total,
        unit: item.unit || 'pcs',
        category: item.category || 'Lain-lain',
      };
    });

    if (!parsed.grandTotal || parsed.grandTotal === 0) {
      parsed.grandTotal = parsed.items.reduce((sum, it) => sum + it.total, 0);
    }

    return parsed;
  });
}

/**
 * Parse natural language text expense in Indonesian
 * e.g., "Beli beras 5kg 75000, minyak sania 2L 35rb di Superindo"
 */
export async function parseTextExpense(textInput: string): Promise<ParsedReceipt> {
  const prompt = `Anda adalah asisten AI yang bertugas mengekstrak catatan belanjaan harian dalam bahasa Indonesia.
Teks input dari pengguna: "${textInput}"

Tugas Anda:
1. Identifikasi nama toko (jika disebutkan, e.g. Indomaret, Superindo, Pasar Tradisional. Jika tidak, gunakan 'Belanja Harian').
2. Ekstrak daftar barang, jumlah (qty), satuan (unit), harga satuan (price), total harga (total), dan kategori.
3. Tangani singkatan bahasa Indonesia seperti:
   - 'rb' atau 'k' = ribu (contoh: 25rb = 25000, 75k = 75000)
   - 'jt' = juta (contoh: 1jt = 1000000)
4. Hitung grandTotal dari semua item.
5. Gunakan tanggal hari ini: ${new Date().toISOString().split('T')[0]}.`;

  return executeWithFallback('Text-Expense', async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            storeName: { type: Type.STRING },
            date: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  qty: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  price: { type: Type.NUMBER },
                  total: { type: Type.NUMBER },
                  category: { type: Type.STRING },
                },
                required: ['name', 'qty', 'unit', 'price', 'total', 'category'],
              },
            },
            grandTotal: { type: Type.NUMBER },
          },
          required: ['storeName', 'date', 'items', 'grandTotal'],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Respons AI kosong saat membaca catatan teks.');
    }

    const parsed: ParsedReceipt = JSON.parse(text);
    return {
      ...parsed,
      subtotal: parsed.grandTotal,
      discount: 0,
      tax: 0,
    };
  });
}
