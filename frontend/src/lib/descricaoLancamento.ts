// Compartilhado entre o modal completo de Lançamentos e o Lançamento Rápido
// — as duas telas tratam a descrição do mesmo jeito (opcional, com
// auto-preenchimento no save; atalho opcional de inserir a data de hoje).

// "Sem descrição. Lançado em dd/mm/aaaa às hh:mm" — usada quando o usuário
// deixa a descrição em branco, no instante do save (não no momento em que o
// formulário foi aberto).
export function descricaoAutomatica() {
  const agora = new Date();
  const dd = String(agora.getDate()).padStart(2, "0");
  const mm = String(agora.getMonth() + 1).padStart(2, "0");
  const hh = String(agora.getHours()).padStart(2, "0");
  const min = String(agora.getMinutes()).padStart(2, "0");
  return `Sem descrição. Lançado em ${dd}/${mm}/${agora.getFullYear()} às ${hh}:${min}`;
}

// Atalho opcional (botão "Inserir Data"): acrescenta "(DD.MM.AAAA)" de hoje
// no fim do texto já digitado — nunca automático. A data do lançamento pode
// diferir do dia da compra; quem decide marcar isso na descrição é o
// usuário, não o app.
export function inserirDataDeHoje(textoAtual: string) {
  const agora = new Date();
  const dd = String(agora.getDate()).padStart(2, "0");
  const mm = String(agora.getMonth() + 1).padStart(2, "0");
  const marcador = `(${dd}.${mm}.${agora.getFullYear()})`;
  const semEspacoNoFim = textoAtual.replace(/\s+$/, "");
  return semEspacoNoFim ? `${semEspacoNoFim} ${marcador}` : marcador;
}
