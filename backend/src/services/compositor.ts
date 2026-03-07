import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { uploadBuffer, getPublicUrl } from '../utils/storage';

const FONT_SIZE = 52;
const PADDING = 40;

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
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

export async function compositeTextOnImage(
  imageBuffer: Buffer,
  text: string
): Promise<Buffer> {
  const img = sharp(imageBuffer);
  const meta = await img.metadata();
  const width = meta.width || 1080;
  const height = meta.height || 1080;

  const maxChars = Math.floor((width - PADDING * 2) / (FONT_SIZE * 0.55));
  const lines = wrapText(text, maxChars);
  const lineHeight = FONT_SIZE * 1.3;
  const blockHeight = lines.length * lineHeight + PADDING * 2;
  const blockY = height - blockHeight - PADDING;

  const textSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0"/>
          <stop offset="100%" stop-color="black" stop-opacity="0.72"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${blockY - 40}" width="${width}" height="${blockHeight + 80}" fill="url(#scrim)"/>
      ${lines.map((line, i) => `
        <text
          x="${width / 2}"
          y="${blockY + PADDING + i * lineHeight + FONT_SIZE}"
          font-family="Arial Black, Arial, sans-serif"
          font-weight="900"
          font-size="${FONT_SIZE}"
          fill="white"
          text-anchor="middle"
          paint-order="stroke"
          stroke="black"
          stroke-width="6"
          stroke-linejoin="round"
        >${escapeXml(line)}</text>
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
  text: string
): Promise<string> {
  const original = await fetchImageBuffer(imageUrl);
  const composited = await compositeTextOnImage(original, text);
  const key = `composited/${uuidv4()}.jpg`;
  await uploadBuffer(composited, key, 'image/jpeg');
  return getPublicUrl(key);
}