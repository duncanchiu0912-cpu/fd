const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
let workerPromise;

function normalizeDigits(value) {
  return value
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[，﹐]/g, ',')
    .replace(/[：﹕]/g, ':')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

async function preprocessImage(file) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('請選擇圖片檔案。');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('圖片需小於 12 MB，請先壓縮或裁切。');
  if (!('createImageBitmap' in window)) return file;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(2, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return file;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = 'grayscale(1) contrast(1.18)';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob || file;
  } finally {
    bitmap.close();
  }
}

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('chi_tra+eng', undefined, {
      logger: (event) => onProgress?.(event),
    })).catch((error) => {
      workerPromise = undefined;
      throw error;
    });
  }
  return workerPromise;
}

function findReceiptFields(rawText) {
  const text = normalizeDigits(rawText);
  const invoice = text.match(/\b[A-Z]{2}[-\s]?[0-9]{8}\b/i)?.[0]?.replace(/[-\s]/g, '').toUpperCase() || '';
  const datePatterns = [
    /(?<year>20\d{2})\s*[年/.\-]\s*(?<month>\d{1,2})\s*[月/.\-]\s*(?<day>\d{1,2})\s*(?:日)?/,
    /(?<year>\d{2,3})\s*年\s*(?<month>\d{1,2})\s*月\s*(?<day>\d{1,2})\s*日?/,
  ];
  let date = '';
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (!match?.groups) continue;
    let year = Number(match.groups.year);
    if (year < 1911) year += 1911;
    if (year < 200) year += 1911;
    const month = Number(match.groups.month);
    const day = Number(match.groups.day);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) {
      date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      break;
    }
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const totalLine = lines.find((line) => /總計|合計|總額|應付|實付|total|amount/i.test(line));
  const amountMatch = totalLine?.match(/(?:總計|合計|總額|應付|實付|total|amount)[^\d]{0,16}([\d,]{1,12}(?:\.\d{1,2})?)/i)
    || text.match(/(?:NT\s*\$?|TWD\s*)\s*([\d,]{1,12}(?:\.\d{1,2})?)/i)
    || text.match(/([\d,]{1,12}(?:\.\d{1,2})?)\s*(?:元|NTD)\b/i);
  const amount = amountMatch?.[1]?.replaceAll(',', '') || '';
  return { invoiceNumber: invoice, date, amount };
}

export async function scanReceipt(file, onProgress) {
  const image = await preprocessImage(file);
  const worker = await getWorker(onProgress);
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(image);
    const text = data.text || '';
    return { text, confidence: Math.round(data.confidence || 0), ...findReceiptFields(text) };
  } catch (error) {
    workerPromise = undefined;
    await worker.terminate().catch(() => {});
    throw error;
  }
}

export async function terminateReceiptOcr() {
  if (!workerPromise) return;
  const pendingWorker = workerPromise;
  workerPromise = undefined;
  try { const worker = await pendingWorker; await worker.terminate(); } catch { /* worker could fail during initialization */ }
}
