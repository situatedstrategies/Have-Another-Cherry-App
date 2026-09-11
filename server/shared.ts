import { timingSafeEqual } from 'crypto';
import type { GoogleGenAI, Type } from '@google/genai';

export const PROJECT_ID = 'gen-lang-client-0987674990';

// Constant-time comparison for secrets, so a mismatch leaks nothing.
export const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

// House style forbids em dashes. The prompts say so too, but the model slips.
export const stripEmDashes = (value: string): string =>
  value.replace(/\s*[\u2014\u2013]\s*/g, ' - ');

// Anything but the image types phones produce collapses to JPEG.
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
export const cleanImageMime = (v: unknown): string =>
  typeof v === 'string' && ALLOWED_IMAGE_MIME.has(v.toLowerCase()) ? v.toLowerCase() : 'image/jpeg';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (value: unknown): value is string =>
  typeof value === 'string' && EMAIL_RE.test(value);

// One Vertex AI client per process, built on first use.
let vertexClient: { ai: GoogleGenAI; Type: typeof Type } | null = null;
export const getVertexClient = async () => {
  if (!vertexClient) {
    const { GoogleGenAI, Type } = await import('@google/genai');
    vertexClient = {
      ai: new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || PROJECT_ID,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      }),
      Type,
    };
  }
  return vertexClient;
};

// Lazily initialize the Firebase Admin SDK (ADC) once, shared across endpoints.
export const ensureAdminApp = async () => {
  const { getApps, initializeApp, applicationDefault } = await import('firebase-admin/app');
  if (!getApps().length) {
    // With projectId omitted, ADC resolves the project the service runs in.
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined;

    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });

    console.log(
      'Firebase Admin initialized for project:',
      projectId || '(resolved from application default credentials)'
    );
  }
};
