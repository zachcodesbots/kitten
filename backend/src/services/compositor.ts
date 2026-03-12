import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { uploadBuffer, getPublicUrl } from '../utils/storage';

const PADDING = 40;

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/(\d+)\.(\S)/g, '$1. $2')
    .trim();
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';

    for (const word of words) {
      if ((current + ' ' + word).trim().length > maxCharsPerLine) {
        if (current) lines.push(current.trim());
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    }

    if (current) {
      lines.push(current.trim());
    } else if (paragraph.trim() === '') {
      lines.push('');
    }
  }

  return lines;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeTextForSvg(str: string): string {
  return escapeXml(str).replace(/ /g, '&#160;');
}

export async function compositeTextOnImage(
  imageBuffer: Buffer,
  text: string,
  isFirst: boolean = false,
  textVerticalPosition?: number | null
): Promise<Buffer> {
  text = normalizeText(text);
  const img = sharp(imageBuffer);
  const meta = await img.metadata();
  const width = meta.width;
  const height = meta.height;
  const textWidth = width * 0.9;
  const FONT_SIZE = Math.round(width * 0.06);
  const maxChars = Math.floor((textWidth - PADDING * 2) / (FONT_SIZE * 0.55));
  const lines = wrapText(text, maxChars);
  const lineHeight = FONT_SIZE * 1.3;
  const blockHeight = lines.length * lineHeight + PADDING * 2;
  const blockY =
    textVerticalPosition == null
      ? (!isFirst
          ? height - blockHeight - height * 0.32
          : height - blockHeight - height * 0.62)
      : (() => {
          const clamped = Math.max(0, Math.min(100, textVerticalPosition));
          const maxBlockY = Math.max(0, height - blockHeight);
          return maxBlockY * (1 - clamped / 100);
        })();
  const textSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${lines.map((line, i) => `
        <text
          x="${width / 2}"
          y="${blockY + PADDING + i * lineHeight + FONT_SIZE}"
          font-family="TikTok Sans, Arial, sans-serif"
          font-weight="500"
          font-size="${FONT_SIZE}"
          fill="white"
          text-anchor="middle"
          paint-order="stroke"
          stroke="black"
          stroke-width="${Math.round(FONT_SIZE * 0.18)}"
          stroke-linejoin="round"
        >${escapeTextForSvg(line)}</text>
      `).join('')}
    </svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(textSvg), blend: 'over' }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function compositeAndUpload(
  imageUrl: string,
  text: string,
  isFirst: boolean = false,
  textVerticalPosition?: number | null
): Promise<string> {
  const original = await fetchImageBuffer(imageUrl);
  const composited = await compositeTextOnImage(original, text, isFirst, textVerticalPosition);
  const key = `composited/${uuidv4()}.jpg`;
  await uploadBuffer(composited, key, 'image/jpeg');
  return getPublicUrl(key);
}