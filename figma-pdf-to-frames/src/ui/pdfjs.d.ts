/**
 * Minimale Deklarationen fuer die global eingebundene pdf.js-Distribution.
 * pdf.js wird nicht gebundelt, sondern von scripts/build.mjs als eigener
 * <script>-Block in die ui.html eingefuegt — das umgeht alle bekannten
 * Bundler-Probleme mit dem `canvas`-require im pdf.js-Build.
 */
declare const pdfjsLib: any;

/** Wird von scripts/build.mjs als Banner in das UI-Bundle injiziert. */
declare const __PDF_WORKER_SOURCE__: string;
