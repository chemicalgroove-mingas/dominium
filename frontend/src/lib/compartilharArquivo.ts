// Entrega um arquivo gerado no cliente pro usuario salvar/compartilhar onde
// quiser. No mobile (PWA), prioriza o menu nativo de compartilhamento via
// navigator.share; sem suporte (a maioria dos desktops) ou se o usuario
// cancelar, cai para abrir em nova aba (o navegador oferece salvar/imprimir).
export async function entregarArquivo(blob: Blob, nomeArquivo: string, mimeType: string) {
  const arquivo = new File([blob], nomeArquivo, { type: mimeType });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [arquivo] })
  ) {
    try {
      await navigator.share({ files: [arquivo], title: nomeArquivo });
      return;
    } catch {
      // Usuario cancelou o share ou o SO recusou — segue pro fallback abaixo.
    }
  }

  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
