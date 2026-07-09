declare module "pdfjs-dist/legacy/build/pdf.min.mjs" {
  export const getDocument: typeof import("pdfjs-dist").getDocument;
  export const GlobalWorkerOptions: typeof import("pdfjs-dist").GlobalWorkerOptions;
  export const version: string;
}
