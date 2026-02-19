// No branded ID needed — workspace entries are identified by their relative path string.
// This is a filesystem browser, not a CRUD entity store.

/** Category derived from file extension */
export type FileCategory =
  | 'code'      // .py .js .ts .jsx .tsx .json .yaml .yml .xml .html .css .sh .bash .zsh .toml .ini .env .sql .go .rs .c .cpp .h .java .rb .php .lua .r .swift .kt
  | 'text'      // .txt .md .log .rst .csv .tsv
  | 'image'     // .png .jpg .jpeg .gif .svg .webp .ico .bmp
  | 'document'  // .pdf .doc .docx .xls .xlsx .ppt .pptx .odt .ods .odp
  | 'archive'   // .zip .tar .gz .bz2 .7z .rar .tgz
  | 'audio'     // .mp3 .wav .ogg .flac .aac .m4a
  | 'video'     // .mp4 .mkv .avi .mov .webm
  | 'binary'    // everything else

/** A single entry in the workspace directory tree */
export interface WorkspaceEntry {
  /** Relative path from workspace root, using '/' as separator (cross-platform) */
  name: string
  /** 'file' or 'directory' */
  type: 'file' | 'directory'
  /** File size in bytes (0 for directories) */
  size: number
  /** ISO 8601 modified timestamp */
  modifiedAt: string
  /** File category based on extension (only for files) */
  category?: FileCategory
  /** Nested children (only for directories, only populated when expanded) */
  children?: WorkspaceEntry[]
}

/** Preview data returned when reading a file */
export interface FilePreviewData {
  /** Relative path from workspace root */
  path: string
  /** File category */
  category: FileCategory
  /** File size in bytes */
  size: number
  /** ISO 8601 modified timestamp */
  modifiedAt: string
  /** Text content for tier-1 files (code/text/csv). null for tier-2. */
  content: string | null
  /** Parsed CSV rows for .csv/.tsv files (first 200 rows max) */
  csvRows?: string[][]
  /** Image URL (relative API path) for image files */
  imageUrl?: string | null
  /** MIME type when determinable */
  mimeType: string
  /** File extension (lowercase, without dot) */
  extension: string
  /** Absolute path on disk (for Electron shell.openPath). Only populated in Electron. */
  absolutePath?: string
}
