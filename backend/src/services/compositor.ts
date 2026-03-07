import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { uploadBuffer, getPublicUrl } from '../utils/storage';

const FONT_SIZE = 58;
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
  const TARGET_WIDTH = 1080;
  const TARGET_HEIGHT = 1350; // 4:5 ratio, common for TikTok slideshows
  const normalizedBuffer = await sharp(imageBuffer)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'cover', position: 'centre' })
    .toBuffer();
  const img = sharp(normalizedBuffer);
  const meta = await img.metadata();
  const width = meta.width || TARGET_WIDTH;
  const height = meta.height || TARGET_HEIGHT;
  const textWidth = width * 0.75;
  const maxChars = Math.floor((textWidth - PADDING * 2) / (FONT_SIZE * 0.55));
  const lines = wrapText(text, maxChars);
  const lineHeight = FONT_SIZE * 1.3;
  const blockHeight = lines.length * lineHeight + PADDING * 2;
  const blockY = !isFirst ? height - blockHeight - PADDING * 6 : height - blockHeight - PADDING * 22;

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
          stroke-width="10"
          stroke-linejoin="round"
        >${escapeXml(line)}</text>
      `).join('')}
    </svg>`;

  return sharp(normalizedBuffer)
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