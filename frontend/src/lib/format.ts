export function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarData(data: string | Date) {
  return new Date(data).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function formatarMesAno(chave: string) {
  const [ano, mes] = chave.split("-");
  const nomes = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];
  return `${nomes[parseInt(mes, 10) - 1]}/${ano.slice(2)}`;
}
