export function mesAtual() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

export function somarMeses(chave: string, delta: number) {
  const [ano, mes] = chave.split("-").map(Number);
  const indice = ano * 12 + (mes - 1) + delta;
  const anoResultado = Math.floor(indice / 12);
  const mesResultado = (indice % 12) + 1;
  return `${anoResultado}-${String(mesResultado).padStart(2, "0")}`;
}

export function formatarMesLabel(chave: string) {
  const [ano, mes] = chave.split("-");
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${nomes[parseInt(mes, 10) - 1]} de ${ano}`;
}

export function formatarMesCurto(chave: string) {
  const [ano, mes] = chave.split("-");
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${nomes[parseInt(mes, 10) - 1]}/${ano.slice(2)}`;
}

export const MESES_ABREV = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export function anoDoMes(chave: string) {
  return parseInt(chave.split("-")[0], 10);
}

export function numeroDoMes(chave: string) {
  return parseInt(chave.split("-")[1], 10);
}

export function montarMes(ano: number, mesNumero: number) {
  return `${ano}-${String(mesNumero).padStart(2, "0")}`;
}

export function diferencaEmMeses(chaveA: string, chaveB: string) {
  const [anoA, mesA] = chaveA.split("-").map(Number);
  const [anoB, mesB] = chaveB.split("-").map(Number);
  return (anoB * 12 + (mesB - 1)) - (anoA * 12 + (mesA - 1));
}

// Formato compacto tipo fatura de cartão ("maio/2026"), usado como orientação
// de mês ao lado de um título — diferente de formatarMesLabel ("Maio de 2026").
export function formatarMesInline(chave: string) {
  const [ano, mes] = chave.split("-");
  const nomes = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${nomes[parseInt(mes, 10) - 1]}/${ano}`;
}
