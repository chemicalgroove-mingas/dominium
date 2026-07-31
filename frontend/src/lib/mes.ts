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
