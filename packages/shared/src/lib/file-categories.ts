import type { FileCategory } from '../types/workspace'

const EXT_TO_CATEGORY: Record<string, FileCategory> = {
  // code
  py: 'code', js: 'code', ts: 'code', jsx: 'code', tsx: 'code',
  json: 'code', yaml: 'code', yml: 'code', xml: 'code', html: 'code',
  css: 'code', scss: 'code', less: 'code', sh: 'code', bash: 'code',
  zsh: 'code', toml: 'code', ini: 'code', env: 'code', sql: 'code',
  go: 'code', rs: 'code', c: 'code', cpp: 'code', h: 'code',
  java: 'code', rb: 'code', php: 'code', lua: 'code', r: 'code',
  swift: 'code', kt: 'code', vue: 'code', svelte: 'code',
  // text
  txt: 'text', md: 'text', log: 'text', rst: 'text',
  // csv/tsv (subcategory of text but useful to distinguish)
  csv: 'text', tsv: 'text',
  // image
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  svg: 'image', webp: 'image', ico: 'image', bmp: 'image',
  // document
  pdf: 'document', doc: 'document', docx: 'document',
  xls: 'document', xlsx: 'document', ppt: 'document', pptx: 'document',
  odt: 'document', ods: 'document', odp: 'document',
  // archive
  zip: 'archive', tar: 'archive', gz: 'archive', bz2: 'archive',
  '7z': 'archive', rar: 'archive', tgz: 'archive',
  // audio
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio',
  aac: 'audio', m4a: 'audio',
  // video
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', webm: 'video',
}

export function getFileCategory(filename: string): FileCategory {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_CATEGORY[ext] ?? 'binary'
}

/** Whether this category supports inline text preview (tier 1) */
export function isTier1(category: FileCategory): boolean {
  return category === 'code' || category === 'text' || category === 'image'
}

/** Get MIME type from extension (best-effort, no library) */
const EXT_TO_MIME: Record<string, string> = {
  // text/code
  txt: 'text/plain', md: 'text/markdown', log: 'text/plain',
  csv: 'text/csv', tsv: 'text/tab-separated-values',
  json: 'application/json', xml: 'application/xml', html: 'text/html',
  css: 'text/css', js: 'text/javascript', ts: 'text/typescript',
  py: 'text/x-python', sh: 'text/x-shellscript', yaml: 'text/yaml', yml: 'text/yaml',
  // images
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp',
  // documents
  pdf: 'application/pdf',
  // archives
  zip: 'application/zip', gz: 'application/gzip',
  // audio/video
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4',
}

export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_MIME[ext] ?? 'application/octet-stream'
}
