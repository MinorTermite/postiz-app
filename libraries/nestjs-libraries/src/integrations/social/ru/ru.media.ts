import { rootCertificates } from 'tls';
import { Agent } from 'undici';
import mime from 'mime-types';
import striptags from 'striptags';
import { RUSSIAN_TRUSTED_ROOT_CA } from './ru.ca';
import { PostDetails } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';

// Media of the local storage provider is stored as `${FRONTEND_URL}/uploads/...`.
// Inside the container FRONTEND_URL points at the host port, so such a url is
// turned back into the path under UPLOAD_DIRECTORY that SocialAbstract reads
// from disk; remote urls are left untouched.
export const ruMediaPath = (path: string) => {
  const frontend = process.env.FRONTEND_URL || '';
  if (
    (process.env.STORAGE_PROVIDER || 'local') === 'local' &&
    frontend &&
    path.startsWith(frontend)
  ) {
    return path.slice(frontend.length);
  }
  return path;
};

export const ruFileName = (path: string) =>
  decodeURIComponent(path.split('?')[0].split('/').pop() || 'file');

export const ruIsVideo = (media: NonNullable<PostDetails['media']>[number]) =>
  media.type === 'video' ||
  (mime.lookup(ruFileName(media.path)) || '').startsWith('video/');

export const ruMimeType = (path: string) =>
  mime.lookup(ruFileName(path)) || 'application/octet-stream';

// Russian state APIs (MAX platform-api2) are signed by the Ministry of Digital
// Development root, which is not in Node's bundle. It is trusted only for the
// requests that pass this dispatcher, not process-wide.
let ruDispatcher: Agent | undefined;
export const ruTrustedDispatcher = () => {
  if (!ruDispatcher) {
    ruDispatcher = new Agent({
      connect: { ca: [...rootCertificates, RUSSIAN_TRUSTED_ROOT_CA.trim()] },
    });
  }
  return ruDispatcher;
};

// Public URL of a media file, for platforms that download media themselves
// (Rutube imports by link). Local uploads are only reachable when FRONTEND_URL
// is a public address.
export const ruPublicUrl = (path: string) => {
  if (path.indexOf('http') === 0) {
    return path;
  }
  return `${process.env.FRONTEND_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

export const ruIsPublicUrl = (url: string) =>
  !/^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i.test(
    url
  );

const decodeEntities = (text: string) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const blockBreaks = (html: string) =>
  (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n');

// Plain text for platforms without markup (VK wall, OK, Rutube description).
export const ruPlainText = (html: string) =>
  decodeEntities(striptags(blockBreaks(html)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// HTML subset that MAX renders with format=html.
export const ruMaxHtml = (html: string) =>
  striptags(
    blockBreaks(html)
      .replace(/<(\/?)strong>/gi, '<$1b>')
      .replace(/<(\/?)em>/gi, '<$1i>'),
    ['b', 'i', 'u', 's', 'a', 'code', 'pre']
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
