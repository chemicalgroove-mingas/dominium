export function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Mesma regra já usada no resumo do Relatório PDF (backend/src/lib/relatorioPdf.js,
// item.negativo = valor < 0): a cor de um valor monetário de resumo segue o
// sinal, não é fixa — negativo é sempre déficit (vermelho), positivo é saldo
// saudável (verde).
export function corPorSinal(valor: number) {
  return valor < 0 ? "text-danger" : "text-success";
}

// Mesma regra do Relatório PDF pro item "Comprometimento"
// (item.negativo = comprometimento > 100): não é sinal, é limiar — acima de
// 100% da renda comprometida é alerta; abaixo disso é só informativo (neutro,
// não "saudável" o suficiente pra virar verde).
export function corComprometimento(comprometimento: number) {
  return comprometimento > 100 ? "text-danger" : "text-cream-100";
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
