import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { uploadBuffer, getPublicUrl } from '../utils/storage';

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
  text: string,
  isFirst: boolean = false
): Promise<Buffer> {
  const img = sharp(imageBuffer);
  const meta = await img.metadata();
  const width = meta.width;
  const height = meta.height;
  const textWidth = width;
  const FONT_SIZE = Math.round(width * 0.06);
  const maxChars = Math.floor((textWidth - PADDING * 2) / (FONT_SIZE * 0.55));
  const lines = wrapText(text, maxChars);
  const lineHeight = FONT_SIZE * 1.3;
  const blockHeight = lines.length * lineHeight + PADDING * 2;
  const blockY = !isFirst 
    ? height - blockHeight - height * 0.32
    : height - blockHeight - height * 0.62;
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
  text: string,
  isFirst: boolean = false
): Promise<string> {
  const original = await fetchImageBuffer(imageUrl);
  const composited = await compositeTextOnImage(original, text, isFirst);
  const key = `composited/${uuidv4()}.jpg`;
  await uploadBuffer(composited, key, 'image/jpeg');
  return getPublicUrl(key);
}