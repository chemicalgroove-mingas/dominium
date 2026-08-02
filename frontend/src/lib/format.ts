export function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Usado no rótulo discreto "Última atualização: ..." quando uma tela exibe
// um snapshot local em vez do dado fresco do servidor.
export function formatarDataHora(timestampMs: number) {
  return new Date(timestampMs).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
